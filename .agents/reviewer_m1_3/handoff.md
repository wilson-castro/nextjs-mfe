# Milestone 1 Remediation Review & Adversarial Report

**Reviewer**: Reviewer 3 (`reviewer`, `critic`)  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/reviewer_m1_3`  
**Parent Agent Conversation ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Target Milestone**: Milestone 1 (Remote App Zone: R1, R2, R5 Remediation)  
**Evaluated Worker**: `worker_m1_fix`  

---

## Review Summary

**Verdict**: **APPROVE**  
**Integrity Assessment**: **PASSED**. No hardcoded test values, no facade/dummy logic, no shortcuts, no fabricated outputs, and no self-certifying mock shortcuts. The previous defect (where unit tests mocked `req.query` while live HTTP failed) was resolved through genuine production code fixes and real multi-scenario unit and live integration testing.  
**Overall Risk Assessment**: **LOW**. The remediation provides dual-layer defense (rewrite query parameter forwarding + URL regex fallback), strict HTTP method enforcement, and robust sanitization.

---

## 1. Observation

Direct observations from source inspection, command outputs, and standalone runtime verification:

### 1.1 Source Code Inspection

1. **`apps/remote-app/next.config.js` (lines 6-14)**:
   ```javascript
   async rewrites() {
     return [
       {
         source: '/_fragmento/:name/:id',
         destination: '/api/fragmento/:name/:id?name=:name&id=:id',
       },
     ];
   },
   ```
   - Verbatim observation: Query string forwarding (`?name=:name&id=:id`) was added to the destination, ensuring Next.js Pages Router populates `req.query` with route parameters during internal rewrite delegation.
   - `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'` remain intact (lines 4-5).
   - `reactStrictMode: true` is set (line 3).

2. **`apps/remote-app/pages/_fragmento/[name]/[id].tsx` (lines 17-56)**:
   ```typescript
   export default function handler(
     req: NextApiRequest,
     res?: NextApiResponse
   ): React.ReactElement | null | void {
     // When Next.js prerenders this page file during build, res is undefined
     if (!res || typeof res.status !== 'function') {
       return null;
     }

     if (req.method !== 'GET') {
       res.status(405).end();
       return;
     }

     let { name, id } = (req.query ?? {}) as { name?: string; id?: string };
     if ((!name || !id) && req.url) {
       const match = req.url.match(/(?:_fragmento|api\/fragmento)\/([^/?#]+)\/([^/?#]+)/);
       if (match) {
         try {
           name = name ?? decodeURIComponent(match[1]);
           id = id ?? decodeURIComponent(match[2]);
         } catch {
           name = name ?? match[1];
           id = id ?? match[2];
         }
       }
     }

     if (!name || !KNOWN_FRAGMENTS.has(name)) {
       res.status(204).end();
       return;
     }

     const safeId = encodeURIComponent(String(id ?? ''));

     res
       .status(200)
       .setHeader('Content-Type', 'text/html; charset=utf-8')
       .end(`<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`);
   }
   ```
   - Verbatim observation:
     - Method guard (`if (req.method !== 'GET') { res.status(405).end(); return; }`) enforces HTTP 405 for all non-GET requests.
     - Dual regex matching `(?:_fragmento|api\/fragmento)\/([^/?#]+)\/([^/?#]+)` provides defense-in-depth URL parameter parsing when `req.query` is missing `name` or `id`.
     - `try / catch` wraps `decodeURIComponent` to gracefully handle malformed URI encodings without throwing unhandled exceptions.
     - `KNOWN_FRAGMENTS.has(name)` ensures only `'demo'` returns 200; all unknown fragments return 204 No Content.
     - Prerender guard (`if (!res || typeof res.status !== 'function') return null;`) ensures static generation during `next build` does not throw.
     - `safeId` is encoded via `encodeURIComponent(String(id ?? ''))`.

3. **`apps/remote-app/pages/api/health.ts` (lines 14-23)**:
   ```typescript
   export default function handler(
     req: NextApiRequest,
     res: NextApiResponse<HealthResponse>
   ): void {
     if (req.method !== 'GET') {
       res.status(405).end();
       return;
     }
     res.status(200).json({ ok: true });
   }
   ```
   - Verbatim observation: Strict method guard returns HTTP 405 for non-GET methods. GET returns HTTP 200 with `{ ok: true }` without domain I/O or database dependencies.

4. **`apps/remote-app/test/` unit tests**:
   - `fragmento.test.ts`:
     - Test 1 (lines 48-62): `GET with name demo and id 1 returns 200 text/html with safe id and no script tags`
     - Test 2 (lines 64-77): `GET with potentially malicious id safely encodes and contains no script tags`
     - Test 3 (lines 79-90): `GET with unknown fragment name returns 204 No Content to mask existence/authorization`
     - Test 4 (lines 92-102): `POST request returns 405 Method Not Allowed`
     - Test 5 (lines 104-119): `GET with empty req.query extracts name and id from req.url (internal rewrite fallback)`
     - Test 6 (lines 121-132): `GET with empty req.query and unknown fragment in req.url returns 204 No Content`
   - `health.test.ts`:
     - Test 1 (lines 34-45): `GET /remote-app/api/health returns 200 with { ok: true } without domain I/O`
     - Test 2 (lines 47-57): `POST /remote-app/api/health returns 405 Method Not Allowed`
     - Test 3 (lines 59-69): `PUT /remote-app/api/health returns 405 Method Not Allowed`
   - `next-config.test.ts`:
     - Test 1 (lines 21-23): `basePath is configured as /remote-app for Multi-Zones routing`
     - Test 2 (lines 25-27): `assetPrefix is configured as /remote-app-static to avoid /_next collisions`
     - Test 3 (lines 29-31): `reactStrictMode is true`
     - Test 4 (lines 33-42): `internal rewrites configure _fragmento route` asserting destination `/api/fragmento/:name/:id?name=:name&id=:id`

5. **Cleanliness Verification**:
   - Running `rtk rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/remote-app/` returned 0 matches.
   - `apps/remote` does not exist; only `apps/host` and `apps/remote-app` exist in `apps/`.
   - Root `package.json` scripts use `--filter remote-app`.

### 1.2 Command Executions & Test Results

1. **Unit Test Suite**:
   ```bash
   rtk npx tsx --test test/*.test.ts (cwd: apps/remote-app)
   ```
   Verbatim output:
   ```
   ✔ GET with name demo and id 1 returns 200 text/html with safe id and no script tags (2.00525ms)
   ✔ GET with potentially malicious id safely encodes and contains no script tags (0.765637ms)
   ✔ GET with unknown fragment name returns 204 No Content to mask existence/authorization (0.69765ms)
   ✔ POST request returns 405 Method Not Allowed (0.391574ms)
   ✔ GET with empty req.query extracts name and id from req.url (internal rewrite fallback) (0.794425ms)
   ✔ GET with empty req.query and unknown fragment in req.url returns 204 No Content (0.423532ms)
   ✔ GET /remote-app/api/health returns 200 with { ok: true } without domain I/O (2.538881ms)
   ✔ POST /remote-app/api/health returns 405 Method Not Allowed (0.360785ms)
   ✔ PUT /remote-app/api/health returns 405 Method Not Allowed (0.305736ms)
   ✔ basePath is configured as /remote-app for Multi-Zones routing (1.601827ms)
   ✔ assetPrefix is configured as /remote-app-static to avoid /_next collisions (0.193446ms)
   ✔ reactStrictMode is true (0.121203ms)
   ✔ internal rewrites configure _fragmento route (0.487112ms)
   ℹ tests 13
   ℹ suites 0
   ℹ pass 13
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 575.17559
   ```
   Exit status: `0`.

2. **TypeScript Strict Typecheck**:
   ```bash
   rtk tsc --noEmit (cwd: apps/remote-app)
   ```
   Verbatim output:
   ```
   TypeScript: No errors found
   ```
   Exit status: `0`. Satisfies `exactOptionalPropertyTypes: true`.

3. **Production Next.js Build**:
   ```bash
   rtk npm run build (cwd: apps/remote-app)
   ```
   Verbatim output:
   ```
   > next build
      ▲ Next.js 15.5.24
      Linting and checking validity of types ...
      Creating an optimized production build ...
    ✓ Compiled successfully in 1782ms
      Collecting page data ...
      Generating static pages (0/3) ...
    ✓ Generating static pages (3/3)
      Finalizing page optimization ...
      Collecting build traces ...
   Route (pages)                                Size  First Load JS
   ┌ ƒ /                                     2.69 kB        87.8 kB
   ├   /_app                                     0 B        85.1 kB
   ├ ○ /_fragmento/[name]/[id]                 585 B        85.7 kB
   ├ ○ /404                                    301 B        85.4 kB
   ├ ○ /500                                    296 B        85.4 kB
   ├ ƒ /api/fragmento/[name]/[id]                0 B        85.1 kB
   ├ ƒ /api/health                               0 B        85.1 kB
   ├ ƒ /api/server-data                          0 B        85.1 kB
   └ ƒ /api/sse-events                           0 B        85.1 kB
   ```
   Exit status: `0`.
   Examining compiled `apps/remote-app/.next/routes-manifest.json` (lines 33-38) confirms:
   ```json
   {
     "source": "/remote-app/_fragmento/:name/:id",
     "destination": "/remote-app/api/fragmento/:name/:id?name=:name&id=:id",
     "regex": "^/remote-app/_fragmento(?:/([^/]+?))(?:/([^/]+?))(?:/)?$"
   }
   ```

### 1.3 Standalone HTTP Probes Against Live Server (Port 3001)

Ran `rtk npm run start` in `apps/remote-app` and executed independent HTTP probes:

1. **Fragment Demo Live Request**:
   `rtk curl -i http://localhost:3001/remote-app/_fragmento/demo/42`
   Output:
   ```http
   HTTP/1.1 200 OK
   Content-Type: text/html; charset=utf-8
   Vary: Accept-Encoding
   Date: Fri, 11 Sep 2026 13:44:50 GMT
   Connection: keep-alive
   Keep-Alive: timeout=5
   Transfer-Encoding: chunked

   <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>
   ```
   Result: **PASS** (Resolved previous Critical defect where 204 was returned).

2. **Unknown Fragment Live Request**:
   `rtk curl -i http://localhost:3001/remote-app/_fragmento/unknown/1`
   Output:
   ```http
   HTTP/1.1 204 No Content
   Date: Fri, 11 Sep 2026 13:44:52 GMT
   Connection: keep-alive
   Keep-Alive: timeout=5
   ```
   Result: **PASS** (204 No Content with 0 body bytes).

3. **Health Check Live GET**:
   `rtk curl -i http://localhost:3001/remote-app/api/health`
   Output:
   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json; charset=utf-8
   ETag: "w6gfy8q1ypb"
   Content-Length: 11
   Vary: Accept-Encoding
   Date: Fri, 11 Sep 2026 13:44:40 GMT
   Connection: keep-alive
   Keep-Alive: timeout=5

   {"ok":true}
   ```
   Result: **PASS**.

4. **Health Check Method Guard (POST / PUT)**:
   `rtk curl -i -X POST http://localhost:3001/remote-app/api/health`
   `rtk curl -i -X PUT http://localhost:3001/remote-app/api/health`
   Output:
   ```http
   HTTP/1.1 405 Method Not Allowed
   ```
   Result: **PASS** (Resolved Minor Finding 2 from reviewer_m1_2).

5. **Fragment Endpoint Method Guard (POST / DELETE)**:
   `rtk curl -i -X POST http://localhost:3001/remote-app/_fragmento/demo/42`
   `rtk curl -i -X DELETE http://localhost:3001/remote-app/_fragmento/demo/42`
   Output:
   ```http
   HTTP/1.1 405 Method Not Allowed
   ```
   Result: **PASS**.

---

## 2. Logic Chain

1. **Resolution of Rewrite Parameter Loss**:
   - In Next.js Pages Router internal rewrites, path parameters (`:name`, `:id`) are not automatically copied to `req.query` inside internal target handlers unless explicitly forwarded in the query string or parsed from the URL.
   - Observation 1.1 (#1) shows `next.config.js` now maps to `/api/fragmento/:name/:id?name=:name&id=:id`.
   - Observation 1.2 (#3) confirms that `routes-manifest.json` compiled with this exact rewrite rule.
   - Observation 1.3 (#1) directly confirms that requesting `GET /remote-app/_fragmento/demo/42` over live HTTP correctly passes parameters to the handler and returns HTTP 200 with `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>`.

2. **Defense-in-Depth via URL Fallback Extraction**:
   - Observation 1.1 (#2) shows `pages/_fragmento/[name]/[id].tsx` contains fallback URL parsing via `req.url.match(/(?:_fragmento|api\/fragmento)\/([^/?#]+)\/([^/?#]+)/)`.
   - If `req.query` ever lacks `name` or `id`, the handler extracts them directly from `req.url` and decodes them safely.
   - Observation 1.2 (#1) confirms unit test passes when `req.query` is an empty object `{}` with URL `/remote-app/_fragmento/demo/42`.

3. **Absence Invariant & Security Enforcement**:
   - For any fragment name not in `KNOWN_FRAGMENTS` (`Set(['demo'])`), the handler immediately returns `res.status(204).end()` (Observation 1.1 #2).
   - This ensures unknown and unauthorized fragments return identical 204 No Content responses with 0 body bytes, maintaining the architectural absence invariant (Observation 1.3 #2).
   - For known fragment `'demo'`, the `id` is encoded using `encodeURIComponent(String(id ?? ''))`. As shown in Section 3, all HTML injection attempts are neutralised.

4. **HTTP Method Guards**:
   - `pages/api/health.ts` and `pages/_fragmento/[name]/[id].tsx` both guard with `if (req.method !== 'GET') { res.status(405).end(); return; }`.
   - Tested over live HTTP (Observation 1.3 #4 and #5), non-GET requests reliably return HTTP 405 Method Not Allowed.

5. **TypeScript and Project Standard Compliance**:
   - `tsconfig.json` specifies `"exactOptionalPropertyTypes": true`.
   - `rtk tsc --noEmit` exits with code 0 (Observation 1.2 #2).
   - All touched files are concise (<60 lines), follow early-guard structure, avoid mutation, and have zero `@module-federation` references.

---

## 3. Adversarial Challenges & Stress Test Results

### Challenge 1: XSS Attack Payloads via Live HTTP
- **Payload**: `GET /remote-app/_fragmento/demo/%3Cscript%3Ealert(1)%3C%2Fscript%3E`
- **Output**:
  ```html
  <div class="fragment fragment--demo"><p>Demo fragment (id: %3Cscript%3Ealert(1)%3C%2Fscript%3E)</p></div>
  ```
- **Evaluation**: The script tag remains strictly URI-encoded inside the `<p>` element. No unencoded `<script>`, `onload`, or `onerror` tokens exist in the output.
- **Result**: **PASS**.

### Challenge 2: Path Traversal Sequences via Live HTTP
- **Payload**: `GET /remote-app/_fragmento/demo/..%2F..%2Fetc%2Fpasswd`
- **Output**:
  ```html
  <div class="fragment fragment--demo"><p>Demo fragment (id: ..%2F..%2Fetc%2Fpasswd)</p></div>
  ```
- **Evaluation**: Zero filesystem I/O occurs. The payload is treated as inert text and encoded safely.
- **Result**: **PASS**.

### Challenge 3: Parameter Overriding & Pollution
- **Scenario A**: `GET /remote-app/_fragmento/unknown/1?name=demo&id=42`
  - Returns 200 because Next.js query parsing receives `name=demo`. This is harmless because `demo` is a public inert fragment and no sensitive domain data is accessed.
- **Scenario B**: `GET /remote-app/_fragmento/demo/42?name=unknown`
  - Returns 204 No Content.
- **Scenario C**: Repeated parameter array `GET /remote-app/_fragmento/demo/42?id=1&id=2`
  - Result: `<div class="fragment fragment--demo"><p>Demo fragment (id: 1%2C2)</p></div>`. The array is converted via `String(id)` and safely URI-encoded without throwing or crashing.
- **Result**: **PASS**.

### Challenge 4: Malformed URI Component in URL Path
- **Scenario**: A request with invalid percent encoding that would cause `decodeURIComponent` to throw `URIError`.
- **Implementation defense**: `pages/_fragmento/[name]/[id].tsx` lines 35-42 wraps `decodeURIComponent` in `try { ... } catch { name = match[1]; id = match[2]; }`.
- **Result**: Handled gracefully without 500 error or crash.
- **Result**: **PASS**.

### Challenge 5: Next.js Prerendering Guard
- **Scenario**: During `next build`, Next.js statically analyzes and executes page component files.
- **Implementation defense**: `if (!res || typeof res.status !== 'function') return null;` at the top of the handler.
- **Result**: `next build` completed in 1782ms with 0 errors (Observation 1.2 #3).
- **Result**: **PASS**.

---

## 4. Verified Claims

| # | Claim | Verification Method | Status |
|---|-------|---------------------|--------|
| 1 | `_fragmento` rewrite forwards query parameters | Inspected `next.config.js` and `.next/routes-manifest.json` | **PASS** |
| 2 | Live `GET /remote-app/_fragmento/demo/42` returns 200 inert HTML | Live `curl` against standalone Next.js server (port 3001) | **PASS** |
| 3 | Unknown fragment returns 204 No Content (0 bytes) | Live `curl` against `/_fragmento/unknown/1` | **PASS** |
| 4 | Non-GET requests on `_fragmento` return 405 | Live `curl -X POST` and `curl -X DELETE` | **PASS** |
| 5 | Live `GET /remote-app/api/health` returns 200 `{ ok: true }` | Live `curl` against `/api/health` | **PASS** |
| 6 | Non-GET requests on `/api/health` return 405 | Live `curl -X POST` and `curl -X PUT` | **PASS** |
| 7 | All 13 unit tests pass | `rtk npx tsx --test test/*.test.ts` | **PASS** |
| 8 | Strict TypeScript typecheck passes | `rtk tsc --noEmit` | **PASS** |
| 9 | Production build succeeds | `rtk npm run build` | **PASS** |
| 10| Zero references to `@module-federation` in `apps/remote-app` | `rtk rg` across `apps/remote-app/` | **PASS** |

---

## 5. Coverage Gaps & Unverified Items

- **Coverage Gap**: Cross-zone routing from port 3000 (`http://localhost:3000/remote-app/*`) through the `apps/host` gateway shell.
  - *Risk level*: LOW.
  - *Recommendation*: Intentionally partitioned; owned by Milestone 2 (`apps/host` shell rewrites). `apps/remote-app` operates correctly as an autonomous zone on port 3001.
- **Unverified Items**: None within Milestone 1 scope.

---

## 6. Caveats

- Milestone 2 (`apps/host` gateway rewrites) is required to test cross-zone proxying from port 3000 to port 3001. All tests and verification in this report are focused on `apps/remote-app` running as a standalone zone.
- No caveats regarding code logic, robustness, or contract conformance.

---

## 7. Conclusion

The remediation performed by `worker_m1_fix` completely and cleanly resolves all issues raised by `reviewer_m1_2` and `challenger_m1_1`. The implementation exhibits defense-in-depth, strict adherence to architectural contracts, zero integrity shortcuts, and full test suite passage.

**Final Verdict**: **APPROVE**

---

## 8. Verification Method

To independently verify this verdict:

1. **Unit Tests**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app
   rtk npx tsx --test test/*.test.ts
   ```
   *Expected*: All 13 tests pass.

2. **TypeScript Compilation**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app
   rtk tsc --noEmit
   ```
   *Expected*: `TypeScript: No errors found` (exit 0).

3. **Production Build**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app
   rtk npm run build
   ```
   *Expected*: Next.js build compiles successfully with 0 errors.

4. **Live HTTP Standalone Verification**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app
   rtk npm run start &
   SERVER_PID=$!
   sleep 2

   # 1. Fragment Demo returns 200 with inert HTML
   curl -i http://localhost:3001/remote-app/_fragmento/demo/42
   # Expected: HTTP/1.1 200 OK, text/html, <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>

   # 2. Fragment Unknown returns 204 No Content
   curl -i http://localhost:3001/remote-app/_fragmento/unknown/1
   # Expected: HTTP/1.1 204 No Content

   # 3. Fragment POST returns 405 Method Not Allowed
   curl -i -X POST http://localhost:3001/remote-app/_fragmento/demo/42
   # Expected: HTTP/1.1 405 Method Not Allowed

   # 4. Health GET returns 200 {"ok":true}
   curl -i http://localhost:3001/remote-app/api/health
   # Expected: HTTP/1.1 200 OK, {"ok":true}

   # 5. Health POST returns 405 Method Not Allowed
   curl -i -X POST http://localhost:3001/remote-app/api/health
   # Expected: HTTP/1.1 405 Method Not Allowed

   kill $SERVER_PID
   ```

5. **Invalidation Conditions**:
   - `curl -i http://localhost:3001/remote-app/_fragmento/demo/42` returning 204 instead of 200.
   - `curl -i -X POST http://localhost:3001/remote-app/api/health` returning 200 instead of 405.
   - Any test failure in `rtk npx tsx --test test/*.test.ts`.
   - Any typecheck error in `rtk tsc --noEmit`.
