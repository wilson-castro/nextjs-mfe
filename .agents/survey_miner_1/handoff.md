# Specification Investigation Report: Next.js Multi-Zones Refactoring

**Date**: 2026-09-11  
**Investigator**: `survey_miner_1` (Specification Miner)  
**Parent Agent ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Workspace**: `/home/gabrigas/Selene/Adventure/nextjs-mfe`  
**Integrity Mode**: Development  

---

## 1. Executive Summary

This report documents the exhaustive specification mining for refactoring the `nextjs-mfe` proof-of-concept from Webpack Module Federation (`@module-federation/nextjs-mf`) to native Next.js Multi-Zones. The specification sources probed are:
1. `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md`
2. `docs/design-bff/mfe/00-arquitetura.md`
3. `docs/design-bff/mfe/01-operacao.md`
4. `docs/design-bff/mfe/02-zonas.md`
5. `docs/superpowers/plans/2026-09-11-multizone-refactor.md`
6. Existing project files (`pnpm-workspace.yaml`, `apps/host/`, `apps/remote/`).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Architecture | Multi-Zones Process Isolation | Shell and zones run as independent Next.js processes communicating strictly over HTTP; no shared Webpack runtime or bundle sharing | HTTP requests via shell gateway | Isolated HTML/JSON response per process | Process crash in one zone does not bring down shell or other zones | `00-arquitetura.md` §1, §3 |
| 2 | Routing | Shell Rewrites Proxying | Shell configures `async rewrites()` to reverse-proxy traffic to zones based on URL prefix | Path requested at port 3000 (`/remote-app`, `/remote-app/*`, `/remote-app-static/*`) | Proxied response from `REMOTE_ZONE_URL` (port 3001) | Non-matching routes fall through to shell routing/404 | `01-operacao.md` §1.1; `2026-09-11-multizone-refactor.md` Task 3 |
| 3 | Routing | Separate Zone Root Rewrite Rule | Next.js rewrite matching `/remote-app/:path*` does NOT match root `/remote-app`; a distinct rule for `/remote-app` is mandatory | Request to `/remote-app` | Rewritten to `http://localhost:3001/remote-app` | If omitted, `/remote-app` triggers shell 404 silently | `01-operacao.md` §1.1; `ORIGINAL_REQUEST.md` R3 |
| 4 | Routing | Zone Base Path & Asset Prefix | Zone configures `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'` to ensure assets and routes do not collide with `/_next` | Inbound requests under `/remote-app` or `/remote-app-static` | Pages served under `/remote-app`, assets under `/remote-app-static` | Asset collisions and 404s if `assetPrefix` / `basePath` omitted | `01-operacao.md` §1.2; `02-zonas.md` §1 |
| 5 | Routing | Shell Non-Delegated Route Protection | Routes `/`, `/login`, `/erro-de-zona`, `/api/auth/*`, `/api/stream`, `/api/otel/*` are handled exclusively by shell and never delegated to zones | HTTP requests to reserved shell paths | Handled by shell | If blanket rewrite `/(.*)` used, SSE and auth break silently | `00-arquitetura.md` §2.3; `01-operacao.md` §1.1 |
| 6 | Navigation | Plain HTML `<a>` Navigation across Zones | Cross-zone links must strictly use native `<a>`, never Next.js `<Link>` | User click on cross-zone link | Full document hard navigation | `<Link>` fails silently across zones with no error thrown | `00-arquitetura.md` §7.2; `01-operacao.md` §4 |
| 7 | Isolation | Shell DAL Exclusion | Shell is strictly a gateway/session/SSE proxy; it contains NO Domain Access Layer (DAL) and makes no business domain calls | User requests | Shell UI and proxy orchestration | Shell becoming a monolithic BFF violates Invariant 2 | `02-zonas.md` §1.2; `ORIGINAL_REQUEST.md` Invariants |
| 8 | Endpoints | Health Check (`/api/health`) | Process liveness check responding with HTTP 200 `{ ok: true }` without touching any domain service or database | `GET /remote-app/api/health` | HTTP 200 `{ "ok": true }` | Non-GET returns 405 or default handler | `01-operacao.md` §5.2; `02-zonas.md` §4; `ORIGINAL_REQUEST.md` R5 |
| 9 | Endpoints | Fragment Endpoint (`/_fragmento`) | Server-to-server composition endpoint serving inert HTML for authorized components | `GET /remote-app/_fragmento/{name}/{id}` | HTTP 200 `text/html; charset=utf-8` | 204 for unknown/unauthorized; 405 for non-GET | `00-arquitetura.md` §6; `02-zonas.md` §2; `ORIGINAL_REQUEST.md` R5 |
| 10 | Security | Inert Fragment HTML Guarantee | Fragment HTML must be completely inert: no `<script>` tags, no inline event handlers, no `'use client'` crossing boundaries | Dynamic fragment render | Static HTML without `<script>` | Scripts rejected by CSP nonce or violate execution sandbox | `02-zonas.md` §2.3; `ORIGINAL_REQUEST.md` Invariants |
| 11 | Security | Unified 204 No Content for Unknown & Forbidden | 204 is the only non-2xx success code for `_fragmento`; masks whether resource does not exist or user lacks permission | `GET` unknown fragment or unauthorized resource | HTTP 204 (empty body) | Caller cannot distinguish 403 from 404 (preserves total absence) | `02-zonas.md` §2.2; `ORIGINAL_REQUEST.md` Invariants |
| 12 | Security | Identity via Cookie Forwarding | Caller never asserts user identity in headers (no `X-Usuario`); caller forwards `Cookie: __Host-session` and callee resolves it | `Cookie: __Host-session=...` | Callee verifies session and evaluates ACL | Header spoofing blocked; authority stays with data owner | `02-zonas.md` §2.1 |
| 13 | Resilience | Fragment Circuit Breaker & Timeout | Calling zone wraps remote fragment fetch in `try/catch` with 2000ms timeout (`AbortSignal.timeout(2000)`) | Foreign fragment fetch | Rendered block or fallback UI | Zone outage does not crash consuming zone | `00-arquitetura.md` §6.2; `01-operacao.md` §5.1 |
| 14 | Typescript | Exact Optional Property Types | `exactOptionalPropertyTypes: true` in `tsconfig.json` ensures absent sensitive blocks are omitted keys, not explicit `undefined` | TypeScript compilation | Enforced type checking | Compilation error if `{ block: undefined }` assigned to optional field | `00-arquitetura.md` §5.1; `02-zonas.md` §4; `ORIGINAL_REQUEST.md` R2 |
| 15 | Packaging | Federation Package Purge | Complete removal of `@module-federation/nextjs-mf`, `@module-federation/enhanced`, and webpack overrides | `pnpm install`, codebase audit | Zero federation references in repo | Build errors or bloated bundles if remnants remain | `ORIGINAL_REQUEST.md` R3, R6; `2026-09-11-multizone-refactor.md` Task 6 |
| 16 | Workspace | App Rename `apps/remote` → `apps/remote-app` | Directory and `package.json` renamed; workspace symlinks refreshed | Directory move, package name edit | Clean pnpm workspace | Missing package or broken workspace paths | `ORIGINAL_REQUEST.md` R1; `2026-09-11-multizone-refactor.md` Task 1 |

---

## 3. Edge Cases Discovered

| # | Feature | Input / Scenario | Observed / Required Behavior |
|---|---|---|---|
| 1 | Shell Rewrites | Request to `/remote-app` (no trailing slash, no subpath) | Next.js rewrite rule `/remote-app/:path*` does NOT match `/remote-app`. Without explicit `{ source: '/remote-app', destination: '${remoteZoneUrl}/remote-app' }`, the request falls through to shell 404 with no error logged. |
| 2 | Shell Rewrites | Wildcard rule `/(.*)` placed in shell rewrites | Swallows shell-internal routes including `/api/stream` (SSE), `/api/auth/*`, and `/api/otel/*`. SSE stream drops silently. Shell rewrites must explicitly scope to zone prefixes. |
| 3 | Cross-Zone Navigation | User clicks `<Link href="/remote-app">` inside shell or zone | Next.js client router attempts single-page soft navigation. Because `/remote-app` belongs to another Next.js zone, routing fails silently, does not load the target page, and leaves the client state broken. Plain `<a>` must be used. |
| 4 | Fragment Endpoint | `POST /remote-app/_fragmento/demo/1` | Fragment endpoints are strictly read-only composition channels. Handlers must reject non-`GET` methods with HTTP 405 Method Not Allowed (`res.status(405).end()`). |
| 5 | Fragment Endpoint | `GET /remote-app/_fragmento/unknown/1` vs `GET /remote-app/_fragmento/restricted/1` | Both MUST return HTTP 204 No Content. Returning HTTP 403 Forbidden for restricted items leaks resource existence to the caller, violating the "ausência total" (total absence) security invariant. |
| 6 | Fragment Endpoint | HTML snippet containing `<script>alert(1)</script>` or `onclick="..."` | Must never be emitted. CSP nonces are per-request and per-zone; foreign scripts fail CSP execution. In addition, client code execution across zone boundaries violates process isolation. |
| 7 | Fragment Endpoint | Special characters in ID parameter (e.g., `id = "foo/bar"`, `id = "42?test=1"`) | The ID parameter must be safely encoded using `encodeURIComponent(String(id))` before interpolation into response HTML, preventing attribute injection or malformed HTML. |
| 8 | Health Check | Domain database or backend service outage | `GET /remote-app/api/health` must NOT query downstream domain services. It must return HTTP 200 `{ ok: true }` solely based on process liveness. Domain-dependent health checks trigger cascading process restarts by orchestrators during domain outages. |
| 9 | Remote Zone Outage | Remote zone at port 3001 is offline while user accesses `http://localhost:3000/remote-app` | Shell reverse proxy fails to connect to upstream port 3001; shell handles the failure gracefully by serving `/erro-de-zona` or default 502/504 gateway response without crashing the host Node process. |
| 10 | TypeScript Optionality | Assigning `{ condicaoComercial: undefined }` when user has no permission | In standard TypeScript, `{ condicaoComercial: undefined }` is accepted for optional properties `condicaoComercial?: T`. With `exactOptionalPropertyTypes: true`, assigning `undefined` to an optional property is a compile error, enforcing true key absence (`delete obj.condicaoComercial` or omitted key). |
| 11 | Cache-Control Headers | Requests to authenticated HTML or `_fragmento` endpoints | Intermediate proxies must not cache user-projected HTML. `Cache-Control: private, no-store` is required so that one user's projected HTML is never served to another user. Assets under `/{zona}-static/*` use `public, max-age=31536000, immutable`. |

---

## 4. Architecture Invariants Specification

The authoritative documents establish non-negotiable architectural invariants:

### 4.1 Composition and Isolation Invariants
1. **Server-Side Composition Over Client Federation**:
   - The refactor transitions from Module Federation (client-side assembly) to Multi-Zones (server-side reverse proxying and server-to-server fragment fetching).
   - Authorization is evaluated **before** any byte leaves the server. Sensitive data cannot leak in client JavaScript bundles.
   - Separate processes mean complete fault isolation: a crash or memory leak in `remote-app` cannot crash `host`.
2. **Authority and Domain Boundaries**:
   - A zone never talks directly to another zone's domain.
   - If `host` or another zone needs data belonging to `remote-app`, it must call `_fragmento`.
   - The calling zone never asserts user identity via headers (e.g. `X-User-Id`). It passes `Cookie: __Host-session`, allowing the owning zone to authenticate and apply its own domain ACL.
3. **Shell Gateway Contract (No DAL in Shell)**:
   - `apps/host` is strictly a routing gateway, session manager, SSE broadcaster, and telemetry collector.
   - `apps/host` **must not contain any Domain Access Layer (DAL)** or direct domain fetch logic.
   - Any business UI needed by the shell must be composed via fragments.

### 4.2 Routing Invariants
1. **Rewrite Rules Structure**:
   - In Next.js, path parameter rewrites like `/remote-app/:path*` match only subpaths (e.g., `/remote-app/sub`), not the root path `/remote-app`.
   - Therefore, the shell's `next.config.js` must declare three explicit rewrite rules:
     - Root: `/remote-app` -> `${remoteZoneUrl}/remote-app`
     - Sub-routes: `/remote-app/:path*` -> `${remoteZoneUrl}/remote-app/:path*`
     - Static assets: `/remote-app-static/:path*` -> `${remoteZoneUrl}/remote-app-static/:path*`
2. **Asset Prefix Isolation**:
   - Every zone must declare an exclusive `assetPrefix` (e.g. `/remote-app-static`).
   - If two zones serve assets from `/_next`, asset hashes collide, and the last deployed zone corrupts asset serving for other zones.
3. **Reserved Shell Routes (No Blanket Rewrites)**:
   - Reserved routes: `/`, `/login`, `/erro-de-zona`, `/api/auth/*`, `/api/stream`, `/api/otel/*`.
   - Rewrites must never use a catch-all pattern like `/(.*)` that intercepts reserved shell endpoints.

### 4.3 Navigation Invariants
1. **Zero `<Link>` for Cross-Zone Navigation**:
   - Next.js `<Link>` performs client-side pushState soft navigation. When pointing to another zone's basePath, the client router cannot find the page component, fails silently, and does not navigate.
   - All navigation between zones must use native HTML `<a>` tags to trigger a full document hard navigation.

### 4.4 Fragment Contract Invariants
1. **HTTP Method**: Exclusively `GET`. Fragments represent composition of view models; mutations must go through Server Actions or dedicated API routes. Non-GET returns HTTP 405.
2. **Content Invariance**:
   - Must return `Content-Type: text/html; charset=utf-8`.
   - Must contain inert HTML only: no `<script>` tags, no event handlers, no `'use client'`.
   - Styling must rely solely on design system tokens (`@erp/ui`), never provider utility classes.
3. **Status Code Invariance**:
   - `200`: Known fragment, authorized, HTML body present.
   - `204`: Unknown fragment OR unauthorized. No body.
   - `405`: Any HTTP method other than `GET`.
   - `403` must NEVER be returned by `_fragmento`. Returning 403 leaks whether the underlying resource exists.

---

## 5. Detailed Specification of Requirements R1 through R6

### R1. Rename `apps/remote` → `apps/remote-app` and Update Workspace
- **Action**:
  - Rename directory `apps/remote` to `apps/remote-app`.
  - Update `name` field in `apps/remote-app/package.json`:
    - Current: `"name": "@mfe/remote"`
    - Target: `"name": "remote-app"` (or `"@mfe/remote-app"` depending on namespace, but the implementation plan specifies `"remote-app"`).
  - Verify `pnpm-workspace.yaml` packages glob covers `apps/*`.
  - Execute `pnpm install` cleanly.
- **Acceptance Criteria**:
  - `apps/remote-app` directory exists; `apps/remote` does not.
  - `pnpm install` completes with exit code 0.

### R2. Configure `apps/remote-app` as a Multi-Zones Zone
- **Action**:
  - In `apps/remote-app/next.config.js`:
    - Remove `NextFederationPlugin` and Webpack federation configuration.
    - Export `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`.
  - In `apps/remote-app/tsconfig.json`:
    - Add `"exactOptionalPropertyTypes": true` to `compilerOptions`.
  - Add test `apps/remote-app/test/next-config.test.ts`.
- **Acceptance Criteria**:
  - `apps/remote-app/next.config.js` defines `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`.
  - `apps/remote-app/tsconfig.json` contains `"exactOptionalPropertyTypes": true`.
  - `apps/remote-app/test/next-config.test.ts` passes.

### R3. Reconfigure `apps/host` Shell with Multi-Zones Rewrites
- **Action**:
  - In `apps/host/next.config.js`:
    - Remove `NextFederationPlugin` and Webpack federation configuration.
    - Add `async rewrites()` function returning the 3 required rules (`/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*`).
    - Use `process.env.REMOTE_ZONE_URL ?? 'http://localhost:3001'`.
  - Delete `apps/host/declarations.d.ts`.
  - Remove `@module-federation/nextjs-mf` from `apps/host/package.json` and `apps/remote-app/package.json`.
  - In `pnpm-workspace.yaml`, remove `allowBuilds`, `onlyBuiltDependencies`, and `overrides` related to Module Federation and Webpack.
  - Add test `apps/host/test/rewrites.test.ts`.
- **Acceptance Criteria**:
  - `apps/host/next.config.js` exports `async rewrites()` matching the 3 routes.
  - `apps/host/test/rewrites.test.ts` passes.
  - Clean `pnpm install` without federation packages.

### R4. Remove Federated Lazy Imports from Host; Cross-Zone Navigation via `<a>`
- **Action**:
  - Delete `apps/host/lib/safeRemoteLoader.ts`.
  - Delete `apps/host/components/FederatedErrorBoundary.tsx`.
  - Delete `apps/host/components/RemoteCardClientWrapper.tsx`.
  - Rewrite `apps/host/pages/index.tsx`:
    - Remove `import('remote/RemoteDashboard')` and `ServerPayload` from `remote/ServerCard`.
    - Remove `fetchRemoteServerData` call.
    - Render shell diagnostics and `<a href="/remote-app" className="zone-link">→ Remote App Zone</a>`.
  - Update `apps/host/components/HostLayout.tsx`:
    - Remove `isRemoteAvailable` and `onTabSelect` props.
  - Update `apps/host/components/SideNavigation.tsx`:
    - Cross-zone links rendered as plain `<a href="/remote-app">`.
  - Update `apps/host/components/Header.tsx` if necessary to remove obsolete `isRemoteAvailable` prop.
  - Ensure `tsc --noEmit` in `apps/host` passes with 0 errors.
- **Acceptance Criteria**:
  - Deleted federation files are removed.
  - No `<Link>` points outside shell prefix; cross-zone links use `<a>`.
  - Shell contains no domain fetch logic or DAL.
  - `npx tsc --noEmit` in `apps/host` returns 0 errors.

### R5. Add Zone Health Check and `_fragmento` Stub to `apps/remote-app`
- **Action**:
  - Create `apps/remote-app/pages/api/health.ts`:
    - Responds to `GET` with HTTP 200 `{ ok: true }`. Zero domain I/O.
  - Create `apps/remote-app/pages/_fragmento/[name]/[id].tsx`:
    - Non-`GET` returns HTTP 405.
    - Unknown `name` returns HTTP 204.
    - Known `name` (`demo`) returns HTTP 200, `Content-Type: text/html; charset=utf-8`, inert HTML containing encoded `id`, and NO `<script>`.
  - Add `apps/remote-app/test/health.test.ts`.
  - Add `apps/remote-app/test/fragmento.test.ts`.
- **Acceptance Criteria**:
  - `GET /remote-app/api/health` returns 200 `{ ok: true }`.
  - `GET /remote-app/_fragmento/demo/42` returns 200 `text/html`, body has no `<script>`.
  - `GET /remote-app/_fragmento/unknown/1` returns 204.
  - `POST /remote-app/_fragmento/demo/1` returns 405.
  - Both unit tests pass.

### R6. Final Cleanup and End-to-End Verification
- **Action**:
  - Run ripgrep audit:
    - `rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/` -> 0 matches.
    - `rg "exposes:|remotes:" apps/` -> 0 matches.
  - Run all unit tests across both apps.
  - Start both applications and perform smoke verification across all primary URLs.
- **Acceptance Criteria**:
  - Zero grep matches for federation artifacts.
  - All unit tests pass.
  - Smoke tests succeed: shell home (3000), remote app index (3000/remote-app), health check (3000/remote-app/api/health), fragment demo (3000/remote-app/_fragmento/demo/42), fragment unknown (3000/remote-app/_fragmento/unknown/1).

---

## 6. Detailed API & Endpoint Specifications

### 6.1 `GET /remote-app/api/health`
- **Path**: `/remote-app/api/health` (resolved through `basePath: '/remote-app'`)
- **Allowed HTTP Method**: `GET`
- **Request Headers**: None required
- **Response Status Code**: `200 OK`
- **Response Content-Type**: `application/json`
- **Response Body**: `{"ok":true}`
- **Constraints**: ZERO domain I/O; process-level check only.

### 6.2 `GET /remote-app/_fragmento/{name}/{id}`
- **Path**: `/remote-app/_fragmento/{name}/{id}`
- **Allowed HTTP Method**: `GET` (all other methods return `405 Method Not Allowed`)
- **Path Parameters**:
  - `name`: Fragment identifier (known in Rodada 1: `demo`)
  - `id`: Resource identifier (must be URL-encoded)
- **Request Headers**:
  - `Cookie: __Host-session=...` (optional in Rodada 1 stub, mandatory in production for ACL)
  - `Accept: text/html`
  - `Accept-Fragmento-Versao: 1` (optional header for version negotiation)
- **Response Status Codes & Bodies**:
  1. **Known fragment (`name == 'demo'`)**:
     - Status: `200 OK`
     - Header: `Content-Type: text/html; charset=utf-8`
     - Body: `<div class="fragment fragment--demo"><p>Demo fragment (id: ${safeId})</p></div>`
     - Constraint: Invariant check — body must NOT match `/<script/i`.
  2. **Unknown fragment (`name != 'demo'`) OR Unauthorized**:
     - Status: `204 No Content`
     - Header: None
     - Body: Empty
     - Constraint: Invariant check — consumer must NOT be able to distinguish unknown from forbidden.
  3. **Method not allowed (`req.method !== 'GET'`)**:
     - Status: `405 Method Not Allowed`
     - Body: Empty

### 6.3 Shell Gateway Rewrites Specification (`apps/host/next.config.js`)
- **Rewrite Rule 1 (Zone Root)**:
  - Source: `/remote-app`
  - Destination: `${REMOTE_ZONE_URL}/remote-app`
- **Rewrite Rule 2 (Zone Sub-routes)**:
  - Source: `/remote-app/:path*`
  - Destination: `${REMOTE_ZONE_URL}/remote-app/:path*`
- **Rewrite Rule 3 (Zone Static Assets)**:
  - Source: `/remote-app-static/:path*`
  - Destination: `${REMOTE_ZONE_URL}/remote-app-static/:path*`

---

## 7. Test Suites and Test Cases Specification

### 7.1 Unit Test Suites

#### Suite 1: `apps/remote-app/test/next-config.test.ts`
- **Runner**: Node built-in test runner via `npx tsx --test`
- **Imports**: `import nextConfig from '../next.config.js'`
- **Test Case 1**: `test('basePath is /remote-app')`
  - Assertion: `expect(nextConfig.basePath).toBe('/remote-app')`
- **Test Case 2**: `test('assetPrefix is /remote-app-static')`
  - Assertion: `expect(nextConfig.assetPrefix).toBe('/remote-app-static')`

#### Suite 2: `apps/host/test/rewrites.test.ts`
- **Runner**: Node built-in test runner via `npx tsx --test`
- **Imports**: `import nextConfig from '../next.config.js'`
- **Test Case 1**: `test('rewrites export is a function')`
  - Assertion: `expect(typeof nextConfig.rewrites).toBe('function')`
- **Test Case 2**: `test('rewrites include zone root, sub-routes, and static assets')`
  - Call: `await nextConfig.rewrites()`
  - Assertions:
    - Array contains `/remote-app`
    - Array contains `/remote-app/:path*`
    - Array contains `/remote-app-static/:path*`

#### Suite 3: `apps/remote-app/test/health.test.ts`
- **Runner**: Node built-in test runner via `npx tsx --test`
- **Imports**: `import handler from '../pages/api/health'`
- **Test Case 1**: `test('returns 200 { ok: true }')`
  - Mocks `req` and `res`
  - Asserts `res._status === 200`
  - Asserts `res._body` equals `{ ok: true }`

#### Suite 4: `apps/remote-app/test/fragmento.test.ts`
- **Runner**: Node built-in test runner via `npx tsx --test`
- **Imports**: `import handler from '../pages/_fragmento/[name]/[id]'`
- **Test Case 1**: `test('GET returns 200 text/html for known fragment name')`
  - Input: `GET`, `{ name: 'demo', id: '1' }`
  - Asserts: `res._status === 200`, `res._headers['Content-Type']` contains `text/html`, `res._body` does NOT contain `<script`
- **Test Case 2**: `test('GET returns 204 for unknown fragment name')`
  - Input: `GET`, `{ name: 'unknown', id: '1' }`
  - Asserts: `res._status === 204`
- **Test Case 3**: `test('POST returns 405')`
  - Input: `POST`, `{ name: 'demo', id: '1' }`
  - Asserts: `res._status === 405`

### 7.2 Static Verification & Typecheck
- **Command 1**: `cd apps/host && npx tsc --noEmit` -> Must return 0 errors.
- **Command 2**: `cd apps/remote-app && npx tsc --noEmit` -> Must return 0 errors.
- **Command 3**: `rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/` -> Must return 0 matches.

### 7.3 Smoke Test Matrix
| URL | Expected Status | Expected Content / Behavior |
|---|---|---|
| `http://localhost:3000/` | `200 OK` | Shell diagnostics rendered; link `<a href="/remote-app">` present; no console federation errors |
| `http://localhost:3000/remote-app` | `200 OK` | Remote standalone app index rendered via shell rewrite |
| `http://localhost:3000/remote-app/api/health` | `200 OK` | `{"ok":true}` |
| `http://localhost:3000/remote-app/_fragmento/demo/42` | `200 OK` | `Content-Type: text/html`, contains `Demo fragment (id: 42)`, no `<script>` |
| `http://localhost:3000/remote-app/_fragmento/unknown/1` | `204 No Content` | Empty response |
| Browser Network Tab | N/A | Exactly 0 requests for `remoteEntry.js` |

---

## 8. 5-Component Handoff Section

### 8.1 Observation
1. **Existing Codebase State**:
   - `apps/remote` is currently named `@mfe/remote` in `apps/remote/package.json` (line 2).
   - `apps/host/next.config.js` imports `NextFederationPlugin` from `@module-federation/nextjs-mf` (line 1) and dynamically loads `remoteEntry.js` (lines 8-13).
   - `apps/remote/next.config.js` exposes `./ServerCard`, `./RemoteMap`, `./RemoteTelemetry`, `./RemoteDashboard`, `./getServerData`, `./events` via `NextFederationPlugin` (lines 8-22).
   - `apps/host/pages/index.tsx` contains lazy import of `remote/RemoteDashboard` (lines 12-28), type import of `ServerPayload` from `remote/ServerCard` (line 4), and calls `fetchRemoteServerData` (line 166).
   - `apps/host/declarations.d.ts` declares modules `remote/ServerCard` and `remote/RemoteDashboard`.
   - `pnpm-workspace.yaml` specifies `allowBuilds`, `onlyBuiltDependencies`, and `overrides` for `@module-federation/nextjs-mf` and `webpack` (lines 4-15).
   - Grep search confirms 22 occurrences of `@module-federation`, `remoteEntry`, `NextFederationPlugin`, `remote/ServerCard`, and `remote/RemoteDashboard` across 8 files in `apps/`.
2. **Authoritative Specification Sources**:
   - `00-arquitetura.md` defines the architectural transition: Multi-Zones + App Router, server-side composition, process isolation, and the rule that shell never talks to domains.
   - `01-operacao.md` defines routing tables, separate root rewrite rule, `assetPrefix`, health checks without domain I/O, and deployment order.
   - `02-zonas.md` defines zone folder structure, fragment contract (`_fragmento`), 204 error masking, inert HTML rule (no `<script>`), and `exactOptionalPropertyTypes: true`.
   - `ORIGINAL_REQUEST.md` specifies requirements R1 through R6, acceptance criteria, and clean grep verification.
   - `2026-09-11-multizone-refactor.md` provides the step-by-step TDD implementation plan, file modifications, and exact test implementations.

### 8.2 Logic Chain
1. *From 00-arquitetura.md §1 & ADR-0008*: Module Federation fails in client-side authorization evaluation because sensitive code/components arrive in the browser before ACL evaluation. Multi-Zones evaluates authorization on the server before emitting HTML. Therefore, all federation plugins and bundle sharing must be removed.
2. *From 01-operacao.md §1.1*: Next.js path rewrite matching `/remote-app/:path*` does not match the bare `/remote-app` path. Therefore, the shell must have two separate rewrite rules for the zone (one for `/remote-app` and one for `/remote-app/:path*`), plus one for static assets (`/remote-app-static/:path*`).
3. *From 00-arquitetura.md §7.2*: Next.js `<Link>` performs client-side router transitions. Across zone boundaries, this fails silently because the receiving zone's bundle is not loaded in the client router. Therefore, all cross-zone links must be native `<a>` tags.
4. *From 02-zonas.md §2.2*: Disclosing a 403 status to a consumer indicates that a resource exists but is restricted, which violates total absence ("ausência total"). Therefore, `_fragmento` must return 204 for both non-existent and forbidden resources.
5. *From 02-zonas.md §2.3*: CSP nonces are generated per-request per-zone; scripts across zones fail CSP and break sandbox boundaries. Therefore, fragment HTML must contain no `<script>` tags or event handlers.
6. *From 01-operacao.md §5.2*: Health checks that query domain services cause orchestrators to restart healthy web tier containers during downstream database outages. Therefore, `/remote-app/api/health` must return `{ ok: true }` without domain I/O.

### 8.3 Caveats
1. **Rodada 1 vs Production Scope**:
   - Redis session store and real domain ACL checks are stubbed in Rodada 1 (`new Set(['demo'])`). Full ACL wiring occurs in Rodada 2.
   - Real-time SSE via `SharedWorker` across zones is scheduled for Rodada 3.
   - A third zone (`comercial`) is scheduled for Rodada 4.
2. **Test Environment (`tsx --test` vs Jest)**:
   - The project uses Node's native test runner with `npx tsx --test`. The tests in `test/*.test.ts` utilize Jest-like global `expect` / `test` patterns. In Node v26, `node:test` is built-in; if `expect` is not globally available in bare `tsx --test`, the test files can import `{ test, expect }` or use Node's `node:test` and `node:assert`. The implementation plan provides the test templates.
3. **`apps/host/components/Header.tsx` Type Compatibility**:
   - `HostLayout.tsx` drops `isRemoteAvailable`, but `Header.tsx` currently defines `isRemoteAvailable: boolean` in `HeaderProps`. Step 5 in Task 4 of the implementation plan notes that `Header.tsx` or `HostLayout.tsx` must be updated to avoid TypeScript compiler errors.

### 8.4 Conclusion
The specifications across `docs/design-bff/mfe/`, `ORIGINAL_REQUEST.md`, and `2026-09-11-multizone-refactor.md` are completely aligned, unambiguous, and ready for immediate implementation. All requirements R1 through R6, architectural invariants, endpoint schemas, error behaviors, and test suites are exhaustively identified and documented.

### 8.5 Verification Method
To independently verify this specification report:
1. Compare the Features Discovered table against `00-arquitetura.md`, `01-operacao.md`, and `02-zonas.md`.
2. Inspect `ORIGINAL_REQUEST.md` to verify all Acceptance Criteria line up with R1-R6.
3. Inspect `docs/superpowers/plans/2026-09-11-multizone-refactor.md` to confirm the tasks match all discovered requirements.
4. Execute `rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/` on the current repo to confirm the baseline federation footprint identified in this report.
