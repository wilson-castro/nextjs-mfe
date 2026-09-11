# Test Infrastructure Specification — Next.js Multi-Zones Architecture

## 1. Test Philosophy

### 1.1 Opaque-Box & Requirement-Driven
The testing strategy for the Next.js Multi-Zones refactoring is strictly **opaque-box** and **requirement-driven**:
- **Zero Internal Module Dependencies**: Tests do not import internal React components, private classes, or server handlers from application bundles. The shell (`apps/host`) and the remote zone (`apps/remote-app`) run as independent OS processes communicating exclusively over standard HTTP.
- **Protocol & Invariant Verification**: All assertions evaluate observable HTTP protocol semantics (status codes, headers, streaming payloads, body content) and static architectural invariants (file layout, absence of deprecated module federation primitives, AST navigation tag analysis).
- **Authoritative Source Derivation**: Every test case derives its expected behavior directly from:
  1. `PROJECT.md` (architecture principles, feature inventory F1–F16, interface contracts)
  2. `ORIGINAL_REQUEST.md` (acceptance criteria R1–R6)
  3. `docs/design-bff/mfe/` (00-arquitetura.md, 01-operacao.md, 02-zonas.md)
  4. `docs/superpowers/plans/2026-09-11-multizone-refactor.md` (step-by-step TDD verification rules)

### 1.2 Defense in Depth: Static & Dynamic Verification
Because Multi-Zones failures are often silent at build time (e.g., client-side `<Link>` navigating across zones fails silently without page load, or missing rewrite rules result in generic 404s), our testing combines:
- **Static Invariant Audits**: Source code analysis verifying zero `@module-federation` packages, tsconfig strictness, plain `<a>` tags for cross-zone navigation, and total absence of Domain Access Layers (DAL) in the host shell.
- **Dynamic HTTP Smoke & Integration**: Live probe execution against shell (port 3000) and remote zone (port 3001) verifying gateway rewrites, static asset proxying, health endpoints, inert fragment contracts, and 204 error masking.

---

## 2. 4-Tier Test Methodology

The testing infrastructure organizes verification into four progressive tiers:

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 4: Real-World Application Scenarios (E2E Journeys)    │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: Cross-Feature Integration Combinations             │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: Boundary & Corner Cases (>= 5 per feature)         │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: Feature Coverage (>= 5 per feature, F1 - F16)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tier 1: Feature Coverage Matrix (>=5 Tests per Feature)

For each of the 16 features defined in `PROJECT.md`, Tier 1 establishes a minimum of 5 dedicated test cases covering core functional expectations.

### F1: Multi-Zones Process Isolation
- **T1-F1-01**: Host boots independently on port 3000 and responds to `GET /` with HTTP 200 without requiring remote zone to be pre-started.
- **T1-F1-02**: Remote zone boots independently on port 3001 and responds to `GET /remote-app` with HTTP 200 without requiring host.
- **T1-F1-03**: Host and remote zone maintain distinct Node.js process IDs and process memory boundaries.
- **T1-F1-04**: Crash or termination of port 3001 process does not terminate or corrupt port 3000 host shell process.
- **T1-F1-05**: Host server logs and remote zone server logs are completely isolated with distinct application identifiers.

### F2: Shell Rewrites Proxying
- **T1-F2-01**: Request to `GET http://localhost:3000/remote-app` transparently proxies to port 3001 and returns 200 OK.
- **T1-F2-02**: Request to `GET http://localhost:3000/remote-app/api/health` proxies to port 3001 and returns 200 OK.
- **T1-F2-03**: Sub-route `GET http://localhost:3000/remote-app/_fragmento/demo/1` proxies to port 3001 and returns 200 OK.
- **T1-F2-04**: Static asset proxying `GET http://localhost:3000/remote-app-static/_next/static/...` proxies without host 404.
- **T1-F2-05**: Upstream response headers (e.g., `Content-Type: text/html; charset=utf-8`) are preserved across the shell rewrite gateway.

### F3: Separate Zone Root Rewrite Rule
- **T1-F3-01**: `apps/host/next.config.js` declares explicit rewrite source for `/remote-app` targeting `${remoteZoneUrl}/remote-app`.
- **T1-F3-02**: `apps/host/next.config.js` declares separate wildcard rewrite source for `/remote-app/:path*`.
- **T1-F3-03**: Direct request to `http://localhost:3000/remote-app` (no trailing slash) does not trigger Next.js redirect loop or 404.
- **T1-F3-04**: Request to `http://localhost:3000/remote-app/` (with trailing slash) resolves properly without breaking rewrite matcher.
- **T1-F3-05**: Unit test `apps/host/test/rewrites.test.ts` verifies both `/remote-app` and `/remote-app/:path*` are present in exported rewrites list.

### F4: Zone Base Path & Asset Prefix
- **T1-F4-01**: `apps/remote-app/next.config.js` exports `basePath: '/remote-app'`.
- **T1-F4-02**: `apps/remote-app/next.config.js` exports `assetPrefix: '/remote-app-static'`.
- **T1-F4-03**: Unit test `apps/remote-app/test/next-config.test.ts` validates both `basePath` and `assetPrefix` exact values.
- **T1-F4-04**: Remote app page HTML output renders asset links prefixed with `/remote-app-static/`.
- **T1-F4-05**: Direct request to port 3001 at root `/` redirects to `/remote-app` or returns 404 in conformance with Next.js `basePath` behavior.

### F5: Shell Non-Delegated Route Protection
- **T1-F5-01**: `GET http://localhost:3000/` routes strictly to host shell index, never proxied to port 3001.
- **T1-F5-02**: `GET http://localhost:3000/api/auth/*` (reserved auth routes) is handled exclusively by host shell.
- **T1-F5-03**: `GET http://localhost:3000/api/stream` (SSE connection) terminates on host shell, not delegated to zone.
- **T1-F5-04**: `GET http://localhost:3000/api/otel/*` (telemetry proxy) is captured by host shell gateway.
- **T1-F5-05**: Reserved host shell pages (`/login`, `/erro-de-zona`) remain accessible even if remote zone is offline.

### F6: Plain HTML `<a>` Navigation
- **T1-F6-01**: Host `pages/index.tsx` renders cross-zone link using `<a href="/remote-app">`, never `<Link href="/remote-app">`.
- **T1-F6-02**: Host `SideNavigation.tsx` renders cross-zone item using plain `<a href="/remote-app">`.
- **T1-F6-03**: Static AST/grep audit confirms zero instances of `next/link` targeting `/remote-app` or outside host zone.
- **T1-F6-04**: Clicking cross-zone navigation link triggers full browser document reload (`hard navigation`), refreshing runtime memory.
- **T1-F6-05**: Clicking cross-zone link does not emit Next.js client-side router transition errors in browser console.

### F7: Shell DAL Exclusion
- **T1-F7-01**: Static audit confirms zero imports of `@prisma/client`, database drivers, or ORMs in `apps/host`.
- **T1-F7-02**: Static audit confirms zero domain business entity fetch functions in `apps/host/lib/` or `apps/host/pages/`.
- **T1-F7-03**: Host `pages/index.tsx` `getServerSideProps` only populates timestamp, session stub, and route diagnostics.
- **T1-F7-04**: Host shell `package.json` contains no business domain dependencies.
- **T1-F7-05**: Host API routes do not perform direct database queries or external ERP domain business transactions.

### F8: Health Check Endpoint
- **T1-F8-01**: `GET http://localhost:3001/remote-app/api/health` returns HTTP 200 OK.
- **T1-F8-02**: Health check response `Content-Type` is `application/json`.
- **T1-F8-03**: Health check response body exactly matches `{"ok":true}`.
- **T1-F8-04**: Health check executes in < 50ms with zero database or network I/O calls.
- **T1-F8-05**: Health check accessed via host proxy `http://localhost:3000/remote-app/api/health` returns HTTP 200 `{"ok":true}`.

### F9: Fragment Endpoint
- **T1-F9-01**: `GET http://localhost:3001/remote-app/_fragmento/demo/42` returns HTTP 200 OK.
- **T1-F9-02**: Fragment response headers contain `Content-Type: text/html; charset=utf-8`.
- **T1-F9-03**: Fragment response body contains `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>`.
- **T1-F9-04**: Fragment endpoint is accessible through shell gateway `http://localhost:3000/remote-app/_fragmento/demo/42`.
- **T1-F9-05**: Internal rewrite in `apps/remote-app/next.config.js` properly routes `/_fragmento/:name/:id` avoiding Pages router underscore omission.

### F10: Inert Fragment HTML Guarantee
- **T1-F10-01**: Regex audit on `_fragmento` response body asserts absence of `<script>` tags (case-insensitive).
- **T1-F10-02**: Regex audit on `_fragmento` response body asserts absence of inline JS handlers (`onclick=`, `onload=`, `onerror=`).
- **T1-F10-03**: Body contains no `'use client'` hydration directives or client bundle bootstrapping tokens.
- **T1-F10-04**: DOM parser validation confirms all fragment tags are static HTML markup (`<div>`, `<p>`, `<span>`, `<ul>`).
- **T1-F10-05**: Unit test `apps/remote-app/test/fragmento.test.ts` enforces `expect(body).not.toMatch(/<script/i)`.

### F11: Unified 204 Error Masking
- **T1-F11-01**: `GET http://localhost:3001/remote-app/_fragmento/unknown_frag/1` returns HTTP 204 No Content.
- **T1-F11-02**: `GET http://localhost:3001/remote-app/_fragmento/demo/unauthorized_id` returns HTTP 204 No Content (never 403 Forbidden).
- **T1-F11-03**: Response body for 204 responses is completely empty (`content-length: 0` or empty payload).
- **T1-F11-04**: Consumer zone cannot distinguish between missing resource and unauthorized resource based on status or headers.
- **T1-F11-05**: Host gateway proxies HTTP 204 without synthesizing 404 or injecting error HTML.

### F12: Identity via Cookie Forwarding
- **T1-F12-01**: Inter-zone fragment request forwards `Cookie: __Host-session=...` from incoming client request.
- **T1-F12-02**: Caller zone does not set artificial identity assertion headers like `X-User-Id` or `X-User-Roles`.
- **T1-F12-03**: Callee zone reads identity strictly from validated session cookie.
- **T1-F12-04**: Tampered or unauthenticated session cookies result in HTTP 204 masking, preserving "total absence".
- **T1-F12-05**: Shell gateway forwards `Cookie` header transparently across rewrites to `/remote-app/*`.

### F13: Fragment Circuit Breaker & Timeout
- **T1-F13-01**: Host fragment fetch utility specifies strict timeout (e.g. 1500ms) for upstream fragment calls.
- **T1-F13-02**: Upstream timeout yields graceful fallback rendering (empty string or skeleton placeholder) instead of 500 crash.
- **T1-F13-03**: Network connection drops to remote zone are caught and handled cleanly by host composition layer.
- **T1-F13-04**: Upstream 5xx errors from remote zone are suppressed by caller, returning empty fragment markup.
- **T1-F13-05**: Rapid successive failures do not cascade to break host shell home page rendering.

### F14: TypeScript Exact Optional Property Types
- **T1-F14-01**: `apps/remote-app/tsconfig.json` contains `"exactOptionalPropertyTypes": true`.
- **T1-F14-02**: Assigning `{ field: undefined }` to `{ field?: string }` fails typecheck (`pnpm typecheck`).
- **T1-F14-03**: Shared types in `apps/remote-app/types/` adhere to strict property contracts.
- **T1-F14-04**: Typecheck passes cleanly across monorepo packages with strict optional properties enabled.
- **T1-F14-05**: CI typecheck script executes `tsc --noEmit` validating zero type errors under exact optional rules.

### F15: Federation Package Purge
- **T1-F15-01**: `rg "@module-federation" apps/` returns zero matches across all source code and configs.
- **T1-F15-02**: `rg "NextFederationPlugin" apps/` returns zero matches.
- **T1-F15-03**: `rg "remoteEntry" apps/` returns zero matches.
- **T1-F15-04**: `apps/host/package.json` and `apps/remote-app/package.json` have no `@module-federation/*` dependencies.
- **T1-F15-05**: `pnpm-workspace.yaml` contains no federation build overrides or webpack build rules.

### F16: App Rename `apps/remote` -> `apps/remote-app`
- **T1-F16-01**: Directory `apps/remote-app` exists and `apps/remote` does not exist.
- **T1-F16-02**: `apps/remote-app/package.json` `name` is updated to `@mfe/remote-app` or `remote-app`.
- **T1-F16-03**: Monorepo root `package.json` scripts target `remote-app` (e.g. `pnpm --filter ... dev`).
- **T1-F16-04**: `pnpm install` resolves dependencies without referencing stale `@mfe/remote`.
- **T1-F16-05**: Build commands `pnpm build` compile both `apps/host` and `apps/remote-app` cleanly.

---

## 4. Tier 2: Boundary & Corner Cases (>=5 Tests per Feature)

Tier 2 exercises edge conditions, malformed inputs, boundary limits, and unexpected HTTP behaviors.

### F1: Multi-Zones Process Isolation
- **T2-F1-01**: Port collision detection: starting remote zone on occupied port emits descriptive error and exits cleanly.
- **T2-F1-02**: High concurrency load (100 simultaneous requests) on shell does not deplete memory or socket pool on zone.
- **T2-F1-03**: Zone restarting during active user session does not invalidate shell session cookie on port 3000.
- **T2-F1-04**: Out-of-order startup: shell started before zone gracefully serves shell routes while proxying responds with standard gateway 502/504 until zone is ready.
- **T2-F1-05**: Slow zone response (> 3000ms) does not hang shell process event loop.

### F2: Shell Rewrites Proxying
- **T2-F2-01**: Encoded characters in sub-path `GET /remote-app/items/a%20b%2Fc` proxied with URI encoding intact.
- **T2-F2-02**: Deep path hierarchy `GET /remote-app/level1/level2/level3/level4/resource` proxied correctly via `:path*`.
- **T2-F2-03**: Complex query strings `GET /remote-app/search?q=test&filter=1&filter=2&tag=mfe#hash` proxied with full query preservation.
- **T2-F2-04**: Large request headers (> 8KB) handled without gateway header overflow or drop.
- **T2-F2-05**: Non-standard HTTP verbs (HEAD, OPTIONS) proxied according to Next.js rewrite semantics.

### F3: Separate Zone Root Rewrite Rule
- **T2-F3-01**: Query string on root `GET /remote-app?ref=dashboard` properly dispatched to `${remoteZoneUrl}/remote-app?ref=dashboard`.
- **T2-F3-02**: Multiple trailing slashes `GET /remote-app//` normalized or routed without infinite redirect loop.
- **T2-F3-03**: Case sensitivity `GET /Remote-App` returns 404 rather than unhandled exception.
- **T2-F3-04**: Sibling prefix match `GET /remote-app-fake` does not trigger `/remote-app` rewrite rule and remains in host.
- **T2-F3-05**: Empty path component resolution across rewrite rules does not trigger unhandled regex exception.

### F4: Zone Base Path & Asset Prefix
- **T2-F4-01**: Nested asset path `GET /remote-app-static/_next/static/chunks/pages/remote-app/index-abc123.js` correctly mapped.
- **T2-F4-02**: Asset URL containing double slashes or dot-segments `../` normalized safely to prevent directory traversal.
- **T2-F4-03**: Direct request to remote zone for asset without `/remote-app-static` prefix returns 404.
- **T2-F4-04**: Cache headers (`Cache-Control: public, max-age=31536000, immutable`) preserved on static asset proxying.
- **T2-F4-05**: MIME type accuracy: `.css` files proxied as `text/css`, `.js` as `application/javascript`.

### F5: Shell Non-Delegated Route Protection
- **T2-F5-01**: Ambiguous route `GET /api/auth/remote-app` handled by host shell auth router, not delegated to zone.
- **T2-F5-02**: Stream endpoint `GET /api/stream` with `Accept: text/event-stream` held open by host shell without proxy disconnection.
- **T2-F5-03**: Request to `/login?returnTo=/remote-app` handled entirely by host shell login page.
- **T2-F5-04**: Zone error page `GET /erro-de-zona` served statically by shell when remote zone is unresponsive.
- **T2-F5-05**: Telemetry endpoint `POST /api/otel/v1/traces` ingested by shell with payload batching, never forwarded to zone.

### F6: Plain HTML `<a>` Navigation
- **T2-F6-01**: Link with target `<a>` attributes: `<a href="/remote-app" target="_blank">` maintains secure attributes (`rel="noopener noreferrer"`).
- **T2-F6-02**: Cross-zone anchor tag containing nested elements (`<a href="/remote-app"><svg /><span>Text</span></a>`) works without client router capture.
- **T2-F6-03**: Rapid double-click on cross-zone `<a>` link handled naturally by browser navigation queue.
- **T2-F6-04**: Keyboard navigation (Enter / Space on focused `<a>` tag) triggers standard browser navigation.
- **T2-F6-05**: Middle-click or Cmd/Ctrl+click on cross-zone link opens remote app in new tab correctly.

### F7: Shell DAL Exclusion
- **T2-F7-01**: Environment variable check: host shell environment contains no database connection strings (`DATABASE_URL`, `PGPASSWORD`).
- **T2-F7-02**: Host bundle size audit: host server bundle size does not include domain client libraries.
- **T2-F7-03**: Static AST check: host shell files do not invoke Prisma, Knex, TypeORM, or fetch calls to domain microservices.
- **T2-F7-04**: Host mock data check: host shell does not maintain embedded mock datasets for orders or commercial products.
- **T2-F7-05**: Host dependency tree scan (`pnpm list --filter @mfe/host`) contains zero domain SDK packages.

### F8: Health Check Endpoint
- **T2-F8-01**: Health check with unexpected query parameters `GET /remote-app/api/health?foo=bar&verbose=true` still returns 200 `{"ok":true}`.
- **T2-F8-02**: Health check with heavy payload in `GET` request body ignored and returns 200 `{"ok":true}`.
- **T2-F8-03**: Non-GET request `POST /remote-app/api/health` handled gracefully (200 or 405 without 500 crash).
- **T2-F8-04**: Health check under simulated high load maintains < 10ms latency.
- **T2-F8-05**: Health check called repeatedly with invalid authorization headers still returns 200 (health is public and liveness-only).

### F9: Fragment Endpoint
- **T2-F9-01**: Path traversal attempt: `GET /remote-app/_fragmento/../../etc/passwd/1` returns 404 or 204, never 500 or file content.
- **T2-F9-02**: URL encoded fragment name `GET /remote-app/_fragmento/demo%00/1` rejected cleanly with 204.
- **T2-F9-03**: ID with special characters `GET /remote-app/_fragmento/demo/<script>alert(1)</script>` properly encoded in output as safe escaped HTML.
- **T2-F9-04**: Extremely long ID string (10,000 characters) handled without server buffer overflow.
- **T2-F9-05**: Missing ID parameter in query string handled cleanly without throwing uncaught TypeError.

### F10: Inert Fragment HTML Guarantee
- **T2-F10-01**: Malicious payload in ID containing `onload="alert(1)"` is escaped and not executable as an attribute.
- **T2-F10-02**: SVG or MathML payloads `<svg><script>alert(1)</script></svg>` in fragment name or ID filtered/escaped.
- **T2-F10-03**: HTML comment injection `<!--` or entity encoding tricks `&lt;script&gt;` cannot break out of inert container div.
- **T2-F10-04**: Fragment response contains no style tags with `@import` or external font resource links that leak requests.
- **T2-F10-05**: Fragment output passes strict CSP validator expecting `script-src 'none'`.

### F11: Unified 204 Error Masking
- **T2-F11-01**: Unknown fragment name `GET /remote-app/_fragmento/non_existent_module/999` returns 204 with 0-byte body.
- **T2-F11-02**: Known fragment name with unauthorized ID returns 204 with identical headers to unknown fragment.
- **T2-F11-03**: Timing attack resilience: response latency difference between "not found" and "unauthorized" is statistically insignificant.
- **T2-F11-04**: Request with malformed session cookie returns 204 without leaking authentication failure reason.
- **T2-F11-05**: Headers in 204 response contain no `X-Error-Reason` or debugging breadcrumbs.

### F12: Identity via Cookie Forwarding
- **T2-F12-01**: Huge cookie header (4KB `__Host-session`) forwarded intact without truncation.
- **T2-F12-02**: Multiple cookies in single header string properly parsed and forwarded.
- **T2-F12-03**: Special characters in session cookie payload safely preserved across HTTP hops.
- **T2-F12-04**: Caller attempting to override identity via spoofed `X-Forwarded-User` header is completely ignored by callee.
- **T2-F12-05**: Cookie with `Secure; HttpOnly; SameSite=Strict` attributes maintained across zone gateway.

### F13: Fragment Circuit Breaker & Timeout
- **T2-F13-01**: Host timeout threshold exceeded (callee delayed 2000ms): host aborts fetch after 1500ms and returns fallback.
- **T2-F13-02**: Connection refused (`ECONNREFUSED` on port 3001): host catches error immediately, logs warning, returns fallback.
- **T2-F13-03**: Half-open TCP socket / connection stall terminated cleanly by client timeout abort controller.
- **T2-F13-04**: Intermittent upstream packet drop handled without crashing host SSR worker thread.
- **T2-F13-05**: DNS resolution failure for remote zone hostname handled cleanly.

### F14: TypeScript Exact Optional Property Types
- **T2-F14-01**: Optional interface field explicitly declared as `undefined` in object literal triggers compiler error under `exactOptionalPropertyTypes`.
- **T2-F14-02**: Function returning optional field correctly differentiates between absent property and `{ field: undefined }`.
- **T2-F14-03**: Spread operator on object with optional fields adheres strictly to exact optional property rules.
- **T2-F14-04**: JSON serialization/deserialization types enforce exact property presence.
- **T2-F14-05**: Type declaration files (`.d.ts`) exported across workspaces validate cleanly with `exactOptionalPropertyTypes`.

### F15: Federation Package Purge
- **T2-F15-01**: Check lockfile (`pnpm-lock.yaml`) confirms absence of `@module-federation/nextjs-mf` dependency entries.
- **T2-F15-02**: Webpack configuration files contain no `remotes`, `exposes`, or `shared` federation configuration objects.
- **T2-F15-03**: Build output directory (`.next/`) contains no `remoteEntry.js` or federated container chunks.
- **T2-F15-04**: Global window object `window.__webpack_require__.f` or federation runtime helpers are absent from client bundle.
- **T2-F15-05**: Verification script `scripts/verify-poc.mjs` or legacy federation checks updated to Multi-Zones standards.

### F16: App Rename `apps/remote` -> `apps/remote-app`
- **T2-F16-01**: Git status confirms directory rename tracked cleanly without duplicate untracked legacy files.
- **T2-F16-02**: Relative path imports in tests (`../next.config.js`) resolve correctly from `apps/remote-app/test/`.
- **T2-F16-03**: Workspace pnpm recursive commands (`pnpm -r build`) discover and build `apps/remote-app`.
- **T2-F16-04**: Environment variable files (`.env`, `.env.local`) in `apps/remote-app` loaded properly by renamed app.
- **T2-F16-05**: Deployment artifacts and build output directories correctly named under `apps/remote-app/.next`.

---

## 5. Tier 3: Cross-Feature Integration Combinations

Tier 3 validates how features interact when composed together across process and network boundaries.

- **T3-COMB-01 (F2 + F3 + F4: Gateway Routing & Zone Asset Pipeline)**:
  A client requests `http://localhost:3000/remote-app`. The shell invokes the root rewrite rule (F3) to proxy to port 3001 (F2). The zone renders HTML configured with `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'` (F4). The browser then requests `/remote-app-static/_next/...` which the shell proxies via asset rewrite rule without 404 or path clipping.
- **T3-COMB-02 (F1 + F6 + F7: Process Isolation & Pure Gateway Navigation)**:
  Host shell runs on port 3000 with zero DAL (F7) and full process isolation (F1). User clicks `<a href="/remote-app">` (F6). The browser performs native HTTP navigation, bypassing client-side pushState router. The remote app loads its own bundle on port 3001. No shared memory or React instances exist across zones.
- **T3-COMB-03 (F9 + F10 + F11 + F12: Server-Side Fragment Composition with Masked Security)**:
  Host server performs SSR composition requesting `GET http://localhost:3001/remote-app/_fragmento/demo/42` with forwarded `__Host-session` cookie (F12). The zone validates authorization: if authorized, it emits inert HTML without `<script>` (F9, F10); if unauthorized or unknown, it emits HTTP 204 No Content (F11). Host injects the inert markup directly into host HTML response.
- **T3-COMB-04 (F5 + F8 + F13: Host Gateway Resilience & Health Telemetry)**:
  Host monitors remote zone health via `GET http://localhost:3000/remote-app/api/health` (F8). When the remote zone crashes or becomes unresponsive, host circuit breaker trips (F13) while host shell non-delegated routes (`/`, `/api/auth`, `/login`) continue functioning with 100% availability (F5).
- **T3-COMB-05 (F14 + F15 + F16: Monorepo Architecture Cleanliness & Type Integrity)**:
  Workspace refactoring renames `apps/remote` -> `apps/remote-app` (F16), strips all Module Federation packages and webpack overrides (F15), and enforces `exactOptionalPropertyTypes: true` (F14). Running `pnpm install`, `pnpm typecheck`, and `pnpm build` across the monorepo produces clean passes with zero federation artifacts.
- **T3-COMB-06 (F2 + F5 + F9: Gateway Namespace Disambiguation)**:
  Host gateway receives requests for `/api/stream` (host reserved F5) and `/remote-app/api/health` (remote proxied F2) and `/remote-app/_fragmento/demo/1` (remote fragment F9). Host correctly separates host-local routes from zone-delegated routes without routing ambiguities.
- **T3-COMB-07 (F9 + F11 + F13: Cascading Failure Shielding)**:
  Host queries multiple fragments across zones. If one fragment endpoint returns 204 (F11) and another times out (F13), host page rendering completes gracefully, assembling available fragments without breaking document layout.
- **T3-COMB-08 (F6 + F15: Federation-Free Client Navigation)**:
  Audit of browser network requests during navigation from `/` to `/remote-app` confirms zero requests for `remoteEntry.js`, zero Webpack federation container initializations, and pure native document navigation (F6, F15).

---

## 6. Tier 4: Real-World Application Scenarios

Tier 4 tests complete real-world user and system journeys reflecting production operational conditions.

### Scenario A: End-to-End User Multi-Zone Navigation
1. User requests `http://localhost:3000/` in browser.
2. Shell renders Home Page with Shell Runtime Diagnostics (`hostRenderTimestamp`, `activeRoute`).
3. User verifies navigation link to `Remote App Zone` is rendered as plain HTML `<a>`.
4. User clicks link; browser navigates to `http://localhost:3000/remote-app`.
5. Shell proxies request to `http://localhost:3001/remote-app`.
6. Remote app index page renders with styling and scripts fetched from `/remote-app-static/**`.
7. Page inspection confirms no `remoteEntry.js` script tags and zero Module Federation runtime errors in console.

### Scenario B: Server-to-Server Fragment Composition & Injection
1. Host shell page needs to display remote demo summary within its layout.
2. Host `getServerSideProps` executes HTTP `GET http://localhost:3001/remote-app/_fragmento/demo/101` passing user session cookie.
3. Remote zone verifies session and returns HTTP 200 `text/html; charset=utf-8` containing `<div class="fragment fragment--demo"><p>Demo fragment (id: 101)</p></div>`.
4. Host verifies returned HTML is inert (zero `<script>` tags, zero event handlers).
5. Host embeds fragment HTML inside host container.
6. Browser renders composite page with host header/navigation and remote fragment block intact.

### Scenario C: Security Absence Masking (Unauthorized Access Attempt)
1. User without required privileges requests a protected fragment `GET http://localhost:3000/remote-app/_fragmento/confidential/8821`.
2. Remote zone determines user lacks permissions.
3. Rather than returning HTTP 403 Forbidden (which would leak the existence of confidential resource 8821), remote zone returns HTTP 204 No Content.
4. Host gateway receives 204 and treats it as empty content.
5. Composite UI renders without error banner, completely omitting the confidential section ("total absence" invariant).

### Scenario D: Zone Degradation & Host Resilience
1. Host shell is active on port 3000. Remote zone on port 3001 is stopped.
2. User navigates to `http://localhost:3000/`. Shell home renders immediately (HTTP 200).
3. User accesses host reserved routes (`/api/stream`, `/login`). Host responds normally.
4. User navigates to `http://localhost:3000/remote-app`.
5. Shell rewrite attempts proxy to port 3001, fails gracefully (gateway error 502/504), and displays fallback error page.
6. Shell process on port 3000 remains alive, healthy, and responsive to subsequent traffic.

### Scenario E: Asset Collision & Isolation Verification
1. Host serves internal assets under `/_next/static/...`.
2. Remote zone serves internal assets under `/remote-app-static/_next/static/...`.
3. Simultaneous requests for host chunk `http://localhost:3000/_next/static/chunks/main.js` and remote chunk `http://localhost:3000/remote-app-static/_next/static/chunks/main.js` resolve to different physical files.
4. Browser caches both without cache key collisions.
5. Zone CSS rules do not pollute host root styling.

---

## 7. Complete 16-Feature Checklist & Mapping

| Feature ID | Feature Name | Requirement Mapping | Primary Verification Tier | Verification Type | Success Criteria |
|---|---|---|---|---|---|
| **F1** | Multi-Zones Process Isolation | R1, R3 | Tier 1 (T1-F1), Tier 4 (Scenario D) | Runtime HTTP & Process | Port 3000 & 3001 run independently; failure isolated |
| **F2** | Shell Rewrites Proxying | R3 | Tier 1 (T1-F2), Tier 3 (T3-COMB-01) | HTTP Proxy / Gateway | `/remote-app/**` and `/remote-app-static/**` proxy to 3001 |
| **F3** | Separate Zone Root Rewrite Rule | R3 | Tier 1 (T1-F3), Tier 2 (T2-F3) | Config AST & HTTP | Explicit rule for `/remote-app` avoids 404 on zone root |
| **F4** | Zone Base Path & Asset Prefix | R2 | Tier 1 (T1-F4), Tier 3 (T3-COMB-01) | Config & HTTP | `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'` |
| **F5** | Shell Non-Delegated Route Protection | R3, Invariants | Tier 1 (T1-F5), Tier 2 (T2-F5) | HTTP Routing | `/`, `/api/auth/*`, `/api/stream`, `/login` never delegated |
| **F6** | Plain HTML `<a>` Navigation | R4, Invariants | Tier 1 (T1-F6), Tier 3 (T3-COMB-02) | Static AST & DOM | Cross-zone links use `<a>`, zero `<Link>` across zones |
| **F7** | Shell DAL Exclusion | R4, Invariants | Tier 1 (T1-F7), Tier 2 (T2-F7) | Static Grep & AST | Zero DAL, DB drivers, or domain fetches in `apps/host` |
| **F8** | Health Check Endpoint | R5 | Tier 1 (T1-F8), Tier 2 (T2-F8) | HTTP Probe | `GET /remote-app/api/health` returns 200 `{"ok":true}` |
| **F9** | Fragment Endpoint | R5 | Tier 1 (T1-F9), Tier 3 (T3-COMB-03) | HTTP Probe | `GET /remote-app/_fragmento/{name}/{id}` serves HTML |
| **F10** | Inert Fragment HTML Guarantee | R5, Invariants | Tier 1 (T1-F10), Tier 4 (Scenario B) | HTML Regex / DOM | Zero `<script>` tags or event handlers in fragment HTML |
| **F11** | Unified 204 Error Masking | R5, Invariants | Tier 1 (T1-F11), Tier 4 (Scenario C) | HTTP Probe | 204 for both unknown and unauthorized (no 403) |
| **F12** | Identity via Cookie Forwarding | Invariants | Tier 1 (T1-F12), Tier 2 (T2-F12) | HTTP Header Inspection | Forward `__Host-session` cookie; no synthetic user headers |
| **F13** | Fragment Circuit Breaker & Timeout | Invariants | Tier 1 (T1-F13), Tier 2 (T2-F13) | Fault Injection / Probe | Timeout & graceful fallback on slow/down fragment fetch |
| **F14** | TypeScript Exact Optional Property Types | R2 | Tier 1 (T1-F14), Tier 2 (T2-F14) | Static Compiler | `"exactOptionalPropertyTypes": true` in zone tsconfig |
| **F15** | Federation Package Purge | R3, R6 | Tier 1 (T1-F15), Tier 2 (T2-F15) | Static Grep & Lockfile | Zero `@module-federation` references, clean pnpm |
| **F16** | App Rename `apps/remote` -> `apps/remote-app` | R1 | Tier 1 (T1-F16), Tier 2 (T2-F16) | Filesystem & Workspace | Directory and package renamed; builds cleanly |

---

## 8. Test Execution Harness Architecture

The test harness is implemented in `scripts/smoke-test.mjs` supported by modular runners:
1. **Offline Mode (`--offline`)**:
   - Executes without requiring active servers.
   - Validates static invariants: zero federation references, tsconfig strictness, cross-zone `<a>` usage, DAL exclusion in host, workspace rename.
2. **Online Smoke Mode (`--online`)**:
   - Probes live servers (`http://localhost:3000` and `http://localhost:3001`).
   - Validates live rewrites, health endpoints, fragment responses, 204 masking, and inert markup.
3. **Hybrid Mode (Default `node scripts/smoke-test.mjs`)**:
   - Runs all offline static checks.
   - Probes for server responsiveness on port 3000 and 3001. If active, runs full online suite; if offline, reports status clearly without failure unless `--strict` / `--ci` is specified.
