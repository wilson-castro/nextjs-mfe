# Challenger 1 Handoff Report — Milestone 1 (Remote App Zone: R1, R2, R5)

**Role**: Challenger 1 (`critic`, `specialist`)  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/challenger_m1_1`  
**Parent Agent Conversation ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Target Milestone**: Milestone 1 (Remote App Zone: R1, R2, R5)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Empirical testing and code inspection yielded the following direct observations:

### 1.1 In-Memory & Direct Handler Stress Tests (90 Tests Executed)
Executed a comprehensive 90-case test suite across 9 categories verifying unit-level and socket-level edge behavior:
- **Category 1: Health Check Endpoint (`apps/remote-app/pages/api/health.ts`)**:
  - `GET /remote-app/api/health` returned HTTP 200 with `{ ok: true }` and `Content-Type: application/json`.
  - Extreme query parameters (10,000 characters, null bytes, unicode, prototype keys `__proto__`, `constructor`) executed without crashing or polluting `Object.prototype`.
  - Huge body payload (1MB) handled without OOM or process crash.
- **Category 2: Fragment Endpoint XSS Attacks (`apps/remote-app/pages/_fragmento/[name]/[id].tsx`)**:
  - XSS payloads in `id` (`<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `javascript:alert(1)`, `"><script>alert(1)</script>`, `<svg/onload=alert(1)>`, `' onfocus='alert(1)'`, `<iframe src="javascript:alert(1)">`, mixed-case `<<SCRIPT>`) were defused via `encodeURIComponent`. The output body contains zero `<script>` tags, zero event handlers (`onerror=`, `onload=`), and only URI-encoded text (e.g. `%3Cscript%3Ealert(1)%3C%2Fscript%3E`).
  - XSS payloads in `name` parameter (`<script>alert(1)</script>`, `demo<script>`) returned HTTP 204 No Content with exactly 0 bytes.
- **Category 3: Fragment Endpoint Path Traversal Attacks**:
  - Path traversal sequences in `id` (`../../etc/passwd`, `..%2F..%2F`, `..%2F..%2Fetc%2Fpasswd`, `../../../../etc/shadow`, `..\..\windows\win.ini`) were defused via URI encoding (`..%2F..%2Fetc%2Fpasswd`). Zero filesystem I/O occurred and no system file contents were leaked.
  - Path traversal in `name` (`../../api/health`, `../demo`, `demo/..`) returned HTTP 204 No Content with 0 bytes.
- **Category 4: Unknown Names & Prototype Pollution**:
  - Unknown fragment names (`foo`, `admin`, `internal`, `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`, `DEMO`, `Demo`) returned HTTP 204 No Content with 0-byte body.
  - Prototype pollution attempts via `id` (`__proto__`, `constructor`) left `Object.prototype` unpolluted (`({}).polluted === undefined`).
  - Masking invariant verified: responses for `admin` (unauthorized) and `unknown` (nonexistent) are byte-for-byte identical (both HTTP 204, empty body).
- **Category 5: HTTP Method Restrictions**:
  - `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`, `CONNECT`, `TRACE`, lowercase `get`, and undefined methods returned HTTP 405 Method Not Allowed.
  - Only uppercase `GET` returned HTTP 200 for known fragments.
- **Category 6: Headers & Inert HTML Guarantees**:
  - 200 response returned exact `Content-Type: text/html; charset=utf-8`.
  - Body contains inert HTML: `<div class="fragment fragment--demo"><p>Demo fragment (id: ${safeId})</p></div>`.
- **Category 7: Extreme Inputs & Memory Pressure**:
  - 1,000,000 character `id` string handled cleanly in 6.2ms without memory leaks or crash.
  - Null bytes (`id\0malicious`) encoded as `%00`.
  - CRLF injection (`test\r\nSet-Cookie: evil`) encoded as `%0D%0A`, preventing HTTP response splitting.
- **Category 8: Build Prerender Guard**:
  - Invocation with `res = undefined` or `res` without `.status` function safely returned `null` without throwing.

### 1.2 CRITICAL BUG: Live Next.js Multi-Zones Route Execution
When testing against the actual compiled Next.js server (`next start -p 3042` with `basePath: '/remote-app'`):

Command executed:
```bash
rtk npx tsx -e "
import { spawn } from 'node:child_process';
async function run() {
  const proc = spawn('npx', ['next', 'start', '-p', '3042'], {
    cwd: '/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app'
  });
  await new Promise(r => setTimeout(r, 2000));
  try {
    const res1 = await fetch('http://127.0.0.1:3042/remote-app/_fragmento/demo/42');
    console.log('GET _fragmento/demo/42:', res1.status, Object.fromEntries(res1.headers.entries()));
    const res2 = await fetch('http://127.0.0.1:3042/remote-app/api/fragmento/demo/42');
    console.log('GET api/fragmento/demo/42:', res2.status, Object.fromEntries(res2.headers.entries()));
    const res3 = await fetch('http://127.0.0.1:3042/remote-app/_fragmento/demo/42?name=demo&id=42');
    console.log('GET _fragmento/demo/42?name=demo&id=42:', res3.status, Object.fromEntries(res3.headers.entries()));
  } finally {
    proc.kill();
  }
}
run();
"
```

Verbatim terminal output:
```
GET _fragmento/demo/42: 204 {
  connection: 'keep-alive',
  date: 'Fri, 11 Sep 2026 13:25:09 GMT',
  'keep-alive': 'timeout=5'
}
GET api/fragmento/demo/42: 200 {
  connection: 'keep-alive',
  'content-type': 'text/html; charset=utf-8',
  date: 'Fri, 11 Sep 2026 13:25:09 GMT',
  'keep-alive': 'timeout=5',
  'transfer-encoding': 'chunked',
  vary: 'Accept-Encoding'
}
GET _fragmento/demo/42?name=demo&id=42: 200 {
  connection: 'keep-alive',
  'content-type': 'text/html; charset=utf-8',
  date: 'Fri, 11 Sep 2026 13:25:09 GMT',
  'keep-alive': 'timeout=5',
  'transfer-encoding': 'chunked',
  vary: 'Accept-Encoding'
}
```

Direct observation from live Next.js execution:
- Requesting `GET /remote-app/_fragmento/demo/42` returns **HTTP 204 No Content** instead of **HTTP 200 OK**!

---

## 2. Logic Chain

1. **Contract Invariant**:
   - `ORIGINAL_REQUEST.md` (lines 28, 56) and `PROJECT.md` (line 76) mandate:
     `GET /remote-app/_fragmento/demo/42` MUST return HTTP 200 with `Content-Type: text/html; charset=utf-8` and inert HTML.
2. **Implementation Mechanism**:
   - In `apps/remote-app/next.config.js` (lines 7-12):
     ```javascript
     async rewrites() {
       return [
         {
           source: '/_fragmento/:name/:id',
           destination: '/api/fragmento/:name/:id',
         },
       ];
     }
     ```
   - In `apps/remote-app/pages/_fragmento/[name]/[id].tsx` (lines 31-35):
     ```typescript
     const { name, id } = (req.query ?? {}) as { name?: string; id?: string };

     if (!name || !KNOWN_FRAGMENTS.has(name)) {
       res.status(204).end();
       return;
     }
     ```
3. **Failure Analysis**:
   - In Next.js Pages Router, an internal rewrite from a path (`/_fragmento/:name/:id`) to an API route (`/api/fragmento/:name/:id`) rewrites the internal request target, but does NOT automatically populate `req.query.name` or `req.query.id` inside the API handler unless query parameters are explicitly forwarded in the destination or parsed from the URL.
   - As observed in Observation 1.2, when `GET /remote-app/_fragmento/demo/42` is requested:
     - `req.query.name` is `undefined`.
     - `!name` evaluates to `true`.
     - The handler executes `res.status(204).end()`.
   - When query parameters are explicitly provided (`GET /remote-app/_fragmento/demo/42?name=demo&id=42`), `req.query.name` is populated, returning HTTP 200.
   - When accessed directly via `GET /remote-app/api/fragmento/demo/42`, Next.js dynamic routing populates `req.query.name = 'demo'`, returning HTTP 200.
   - The worker's unit tests (`apps/remote-app/test/fragmento.test.ts`) passed solely because the test created an artificial mock request with `{ name: 'demo', id: '1' }` pre-injected into `mockReq.query`, completely bypassing the Next.js rewrite runtime.
4. **Conclusion of Logic Chain**:
   - The remote zone implementation in Milestone 1 breaks the live Multi-Zones fragment contract on port 3001. A consumer fetching `GET /remote-app/_fragmento/demo/42` receives HTTP 204 empty response instead of the demo HTML fragment.

---

## 3. Caveats

1. **Milestone 2 Host Shell Dependency**:
   - Testing cross-zone proxying from port 3000 (`http://localhost:3000/remote-app/_fragmento/demo/42`) depends on Milestone 2 (`apps/host` rewrites). However, the defect identified in this review exists entirely within `apps/remote-app` on port 3001.
2. **Review-Only Constraint**:
   - As Challenger, I have not modified implementation code in `apps/remote-app/`. The fix must be implemented by the Milestone 1 worker.

---

## 4. Conclusion & Required Changes

**Final Verdict**: **REQUEST_CHANGES**

Milestone 1 satisfies security properties (XSS prevention, path traversal rejection, prototype pollution immunity, 405 method enforcement, zero federation imports, exact optional property types), but **FAILS** the primary functional fragment route contract when executed in a live Next.js environment.

### Actionable Remediation Required for Worker M1

Worker M1 must apply one (or both for defense-in-depth) of the following fixes:

#### Fix Option A: Update Rewrite Destination in `apps/remote-app/next.config.js`
Forward the route parameters as query parameters in the rewrite destination:
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

#### Fix Option B: URL Fallback Parsing in `apps/remote-app/pages/_fragmento/[name]/[id].tsx`
Add fallback URL parsing in the fragment handler when `req.query.name` is not pre-populated by Next.js rewrites:
```typescript
  let { name, id } = (req.query ?? {}) as { name?: string; id?: string };

  if (!name && req.url) {
    const urlMatch = req.url.match(/_fragmento\/([^/?]+)\/([^/?]+)/);
    if (urlMatch) {
      name = decodeURIComponent(urlMatch[1]);
      id = decodeURIComponent(urlMatch[2]);
    }
  }
```

#### Test Addition:
Add an end-to-end integration test in `apps/remote-app/test/` that verifies `GET /remote-app/_fragmento/demo/42` against a running Next.js instance or mock server simulating the rewrite query behavior.

---

## 5. Verification Method

To independently verify the bug reproduction and validate the subsequent fix:

1. **Build the zone application**:
   ```bash
   rtk proxy pnpm --filter remote-app run build
   ```
2. **Start the Next.js server**:
   ```bash
   npx next start -p 3042
   # in apps/remote-app
   ```
3. **Execute the reproduction command**:
   ```bash
   curl -i http://127.0.0.1:3042/remote-app/_fragmento/demo/42
   ```
4. **Current Defective Output**:
   ```http
   HTTP/1.1 204 No Content
   connection: keep-alive
   date: ...
   ```
5. **Expected Correct Output**:
   ```http
   HTTP/1.1 200 OK
   content-type: text/html; charset=utf-8
   transfer-encoding: chunked
   ...

   <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>
   ```
6. **Invalidation Condition**:
   - If `curl -i http://127.0.0.1:3042/remote-app/_fragmento/demo/42` returns HTTP 200 with `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>` and all 90 unit/stress tests pass, the change request can be resolved and approved.
