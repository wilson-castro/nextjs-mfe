# Milestone 1 (Remote App Zone: R1, R2, R5) Adversarial Review Report

**Reviewer**: Reviewer 2 (`reviewer`, `critic`)  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/reviewer_m1_2`  
**Parent Agent Conversation ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Evaluated Milestone**: Milestone 1 (Remote App Zone Migration: R1, R2, R5)  
**Evaluated Worker**: `worker_m1`  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**  
**Integrity Assessment**: No malicious cheating detected, but a significant verification methodology gap was uncovered: unit tests self-certified behavior by mocking pre-populated `req.query`, completely masking a runtime HTTP routing breakdown where live requests return `204 No Content` instead of `200 OK`.  
**Overall Risk Assessment**: **HIGH** (Core architectural fragment contract fails over live HTTP).

---

## Findings

### [Critical] Finding 1: Live HTTP `GET /remote-app/_fragmento/demo/42` Returns 204 No Content Instead of 200 OK

- **What**: When `apps/remote-app` is running (`next start -p 3001`), querying `GET /remote-app/_fragmento/demo/42` returns `HTTP 204 No Content` with an empty body instead of the required `HTTP 200 OK` with `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>`.
- **Where**: 
  - `apps/remote-app/pages/_fragmento/[name]/[id].tsx` lines 31-36
  - `apps/remote-app/next.config.js` lines 6-13
  - `apps/remote-app/test/fragmento.test.ts` lines 46-60
- **Why**: 
  Next.js Pages Router internal rewrites do not automatically populate `req.query` with named route parameters from the rewrite destination when proxying to an internal API handler. 
  When a request arrives at `/remote-app/_fragmento/demo/42`, the rewrite maps it to `/api/fragmento/demo/42`. However, `req.query` arrives at the handler as `{}` (empty object) without `name` or `id`.
  In `pages/_fragmento/[name]/[id].tsx`:
  ```typescript
  const { name, id } = (req.query ?? {}) as { name?: string; id?: string };
  if (!name || !KNOWN_FRAGMENTS.has(name)) {
    res.status(204).end();
    return;
  }
  ```
  Because `name` is `undefined`, `!name` evaluates to `true`, and the handler returns `204 No Content`.
  This violates:
  - `ORIGINAL_REQUEST.md` line 28 & 56 (`GET http://localhost:3000/remote-app/_fragmento/demo/42` must return 200 `text/html`)
  - `PROJECT.md` line 76 (`If name === 'demo': HTTP 200 OK`)
  - `test/e2e/online-smoke.mjs` line 112 (`testFragmentDemoDirect` expects HTTP 200).
- **Why It Passed Worker Tests**:
  `apps/remote-app/test/fragmento.test.ts` tested the handler strictly in-memory by directly passing a synthetic mock request:
  ```typescript
  const mockReq = createMockRequest('GET', { name: 'demo', id: '1' });
  ```
  This decoupled unit test bypassed the Next.js runtime routing pipeline and gave false confidence that the endpoint worked.
- **Suggested Fix Direction**:
  In `apps/remote-app/pages/_fragmento/[name]/[id].tsx`, implement fallback parameter extraction from `req.url` if `req.query.name` or `req.query.id` is missing:
  ```typescript
  let { name, id } = (req.query ?? {}) as { name?: string; id?: string };
  if ((!name || !id) && req.url) {
    const match = req.url.match(/_fragmento\/([^/?#]+)\/([^/?#]+)/);
    if (match) {
      name = name ?? decodeURIComponent(match[1]);
      id = id ?? decodeURIComponent(match[2]);
    }
  }
  ```
  In addition, update `apps/remote-app/test/fragmento.test.ts` to include a test case verifying that `handler` correctly extracts parameters from `req.url` when `req.query` is empty (simulating the Next.js rewrite environment).

---

### [Minor] Finding 2: `pages/api/health.ts` Accepts Any HTTP Verb Without 405 Method Guard

- **What**: `POST /remote-app/api/health` returns `200 { ok: true }`.
- **Where**: `apps/remote-app/pages/api/health.ts` lines 14-19
- **Why**: Not strictly prohibited by R5, but standard REST practice for a health probe is to accept `GET` (and optionally `HEAD`) and return `405 Method Not Allowed` for mutating methods (`POST`, `PUT`, `DELETE`).
- **Suggestion**: Add `if (req.method !== 'GET') { res.status(405).end(); return; }` to `health.ts`.

---

## 1. Observation

Direct observations from independent test execution and runtime investigation:

### 1.1 Independent Command Executions

1. **Unit Test Suite**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app && rtk npx tsx --test test/*.test.ts
   ```
   *Output*:
   ```
   ✔ GET with name demo and id 1 returns 200 text/html with safe id and no script tags (4.920827ms)
   ✔ GET with potentially malicious id safely encodes and contains no script tags (0.40624ms)
   ✔ GET with unknown fragment name returns 204 No Content to mask existence/authorization (0.177995ms)
   ✔ POST request returns 405 Method Not Allowed (0.172884ms)
   ✔ GET /remote-app/api/health returns 200 with { ok: true } without domain I/O (2.972347ms)
   ✔ basePath is configured as /remote-app for Multi-Zones routing (2.48587ms)
   ✔ assetPrefix is configured as /remote-app-static to avoid /_next collisions (1.045381ms)
   ✔ reactStrictMode is true (0.538882ms)
   ✔ internal rewrites configure _fragmento route (0.886289ms)
   ℹ tests 9 | pass 9 | fail 0
   ```
   Exit status: `0`.

2. **TypeScript Strict Typecheck**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app && rtk tsc --noEmit
   ```
   *Output*: `TypeScript: No errors found`. Exit status: `0`.

3. **Module Federation Reference Grep**:
   ```bash
   rtk rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/remote-app/
   ```
   *Output*: Zero matches found. Exit status: `1`.

4. **Isolated Production Next.js Build**:
   ```bash
   rtk proxy pnpm --filter remote-app run build
   ```
   *Output*:
   ```
   ✓ Compiled successfully in 5.5s
     Generating static pages (3/3)
     Collecting build traces ...
   Route (pages)                                Size  First Load JS
   ┌ ƒ /                                     2.69 kB        87.8 kB
   ├   /_app                                     0 B        85.1 kB
   ├ ○ /_fragmento/[name]/[id]                 494 B        85.6 kB
   ├ ○ /404                                    301 B        85.4 kB
   ├ ○ /500                                    296 B        85.4 kB
   ├ ƒ /api/fragmento/[name]/[id]                0 B        85.1 kB
   ├ ƒ /api/health                               0 B        85.1 kB
   ├ ƒ /api/server-data                          0 B        85.1 kB
   └ ƒ /api/sse-events                           0 B        85.1 kB
   ```
   Exit status: `0`.

### 1.2 Live Standalone HTTP Runtime Probing (Port 3001)

Launched `next start -p 3001` in background task:
1. `GET http://localhost:3001/remote-app/api/health`:
   ```
   HTTP/1.1 200 OK
   Content-Type: application/json; charset=utf-8
   {"ok":true}
   ```
   Verified: PASS.

2. `GET http://localhost:3001/remote-app/api/fragmento/demo/42`:
   ```
   HTTP/1.1 200 OK
   Content-Type: text/html; charset=utf-8
   <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>
   ```
   Verified: PASS.

3. `GET http://localhost:3001/remote-app/_fragmento/demo/42`:
   ```
   HTTP/1.1 204 No Content
   ```
   Verified: **FAIL** (Returns 204 with empty body instead of 200 HTML).

4. `GET http://localhost:3001/remote-app/_fragmento/demo/42?name=demo&id=42`:
   ```
   HTTP/1.1 200 OK
   Content-Type: text/html; charset=utf-8
   <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>
   ```
   Verified: Demonstrates conclusively that the failure in check #3 is caused by empty `req.query` during rewrite execution.

---

## 2. Logic Chain

1. **R1 (Directory Rename and Workspace Scripts)**:
   - Observation 1.1 (#3) confirms zero references to Module Federation in `apps/remote-app/`.
   - `apps/remote` is gone; `apps/remote-app` exists with package name `"remote-app"`.
   - Root `package.json` correctly uses `--filter remote-app`.
   - *Assessment*: R1 is fully and cleanly satisfied.

2. **R2 (Multi-Zones Zone Configuration)**:
   - `next.config.js` configures `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`.
   - `tsconfig.json` enforces `"exactOptionalPropertyTypes": true`.
   - `types/index.ts` unions `| undefined` on optional properties to resolve TS2375 errors in `RemoteDashboard.tsx`.
   - `tsc --noEmit` passes with 0 errors (Observation 1.1 #2).
   - *Assessment*: R2 is fully and cleanly satisfied.

3. **R5 (Health Check and Fragment Contract)**:
   - `pages/api/health.ts` returns `{ ok: true }` without domain I/O (Observation 1.2 #1).
   - `pages/_fragmento/[name]/[id].tsx` and `pages/api/fragmento/[name]/[id].ts` correctly implement XSS protection (`encodeURIComponent`), whitelist checking (`Set(['demo'])`), and method enforcement (`405` for non-GET).
   - **However**, when requested via the canonical path `GET /remote-app/_fragmento/demo/42` through the Next.js rewrite engine, `req.query` is not populated with the dynamic route parameters.
   - Because `req.query.name` is undefined, the handler falls through to `res.status(204).end()` (Observation 1.2 #3).
   - *Assessment*: R5 fails the live contract requirement.

4. **Integrity and Test Verification Method Assessment**:
   - The worker ran `npx tsx --test test/*.test.ts`, which passed because the test mocked `req.query`.
   - The worker did not run a live HTTP probe against `/_fragmento/demo/42`.
   - While not deliberate malice or cheating, relying solely on synthetic in-memory unit tests that bypass Next.js rewrites is a verification gap that allowed a broken feature to be handed off as complete.

---

## 3. Adversarial Challenges & Edge Cases

### Challenge 1: XSS and HTML Tag Smuggling in Fragment ID
- **Attack Payload**: `id = '<script>alert("xss")</script>'`, `id = '"><img src=x onerror=alert(1)>'`.
- **Result**: `encodeURIComponent` converts `<` to `%3C`, `>` to `%3E`, and `"` to `%22`. The rendered output is strictly text inside `<p>Demo fragment (id: ...)</p>`. No HTML tags or executable DOM nodes are injected.
- **Status**: PASSED.

### Challenge 2: Parameter Pollution & Prototype Poisoning
- **Attack Payload**: `name = '__proto__'`, `name = 'constructor'`, `name = ['demo', 'evil']`.
- **Result**: `KNOWN_FRAGMENTS` is an instance of JS `Set`. `Set.prototype.has('__proto__')` is `false`. Array inputs fail `.has()`. All return 204 No Content.
- **Status**: PASSED.

### Challenge 3: Next.js Static Build Prerendering Resilience
- **Attack Scenario**: Next.js build runs `getStaticPaths`/page compilation on all non-API page files in `pages/`.
- **Result**: `pages/_fragmento/[name]/[id].tsx` includes `if (!res || typeof res.status !== 'function') return null;`. Static page generator completes without throwing.
- **Status**: PASSED.

### Challenge 4: Live HTTP Routing Through Next.js Rewrite Pipeline
- **Attack Scenario**: Send real HTTP request to `http://localhost:3001/remote-app/_fragmento/demo/42`.
- **Result**: Returns HTTP 204 No Content because Next.js rewrites do not populate `req.query.name` for internal API routes.
- **Status**: **FAILED** (Captured in Finding 1).

---

## 4. Caveats

- Milestone 2 (`apps/host` shell rewrites) is required to test cross-zone proxying from port 3000 to port 3001. The failure documented above is strictly internal to `apps/remote-app` on port 3001.
- `scripts/smoke-test.mjs --offline` failures in STATIC-01, STATIC-03, and STATIC-06 were analyzed and confirmed to belong exclusively to `apps/host` (owned by Milestone 2).

---

## 5. Conclusion & Actionable Next Steps

Milestone 1 cannot be approved until Finding 1 is fixed.

**Verdict: REQUEST_CHANGES**

### Actionable Fix for Worker M1:
1. Edit `apps/remote-app/pages/_fragmento/[name]/[id].tsx`:
   Extract `name` and `id` from `req.url` as fallback when `req.query` does not contain them:
   ```typescript
   let { name, id } = (req.query ?? {}) as { name?: string; id?: string };
   if ((!name || !id) && req.url) {
     const match = req.url.match(/_fragmento\/([^/?#]+)\/([^/?#]+)/);
     if (match) {
       name = name ?? decodeURIComponent(match[1]);
       id = id ?? decodeURIComponent(match[2]);
     }
   }
   ```
2. Add a test in `apps/remote-app/test/fragmento.test.ts` that verifies `handler` extracts `name` and `id` from `req.url` when `req.query` is empty `{}`.
3. Run `next start -p 3001` and verify with `curl -i http://localhost:3001/remote-app/_fragmento/demo/42` that it returns `HTTP 200 OK` with `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>`.

---

## 6. Verification Method

To independently reproduce this finding:
1. Build and start remote-app:
   ```bash
   pnpm --filter remote-app run build
   pnpm --filter remote-app start &
   ```
2. Run curl probe:
   ```bash
   curl -i http://localhost:3001/remote-app/_fragmento/demo/42
   ```
3. Observe `HTTP/1.1 204 No Content` instead of `HTTP/1.1 200 OK`.
