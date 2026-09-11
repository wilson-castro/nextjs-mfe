# Project: nextjs-mfe Native Multi-Zones Refactoring

## Architecture
Transition from Webpack Module Federation (`@module-federation/nextjs-mf`) to native Next.js Multi-Zones architecture following `docs/design-bff/mfe/` and `docs/superpowers/plans/2026-09-11-multizone-refactor.md`.

### Core Architecture Principles
1. **Process & Runtime Isolation**:
   - `apps/host` (Shell): Gateway on port 3000. Handles session, telemetry proxy, and reverse-proxies `/remote-app` traffic via Next.js `rewrites()`. Contains NO Domain Access Layer (DAL) and makes no business domain calls.
   - `apps/remote-app` (Zone): Autonomous Next.js app on port 3001. Configured with `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`. Has its own BFF, data lifecycle, and `exactOptionalPropertyTypes: true`.
   - Host and zone never share a Webpack bundle or runtime; communication is strictly over HTTP.
2. **Routing & Gateway Proxying**:
   - Next.js rewrite matching `/remote-app/:path*` does NOT match root `/remote-app`. Three distinct rules are required in `apps/host/next.config.js`:
     - Zone root: `/remote-app` -> `${remoteZoneUrl}/remote-app`
     - Zone sub-routes: `/remote-app/:path*` -> `${remoteZoneUrl}/remote-app/:path*`
     - Zone static assets: `/remote-app-static/:path*` -> `${remoteZoneUrl}/remote-app-static/:path*`
3. **Cross-Zone Navigation**:
   - Cross-zone links must strictly use native HTML `<a>` tags, never Next.js `<Link>`. `<Link>` performs client-side pushState routing which fails silently across distinct zone bundles.
4. **Server-Side Composition & Fragment Contract**:
   - Zone exposes `GET /remote-app/_fragmento/{name}/{id}`.
   - Returns 200 `text/html; charset=utf-8` containing inert HTML (strictly no `<script>` tags, no event handlers).
   - Unknown or unauthorized fragments return HTTP 204 No Content (preserves "ausência total" — caller cannot distinguish 403 from 404).
   - Non-GET requests return HTTP 405 Method Not Allowed.
   - Because Next.js Pages Router ignores folders prefixed with `_`, `apps/remote-app/next.config.js` configures internal rewrite for `/_fragmento/:name/:id`.
5. **Process Liveness**:
   - `GET /remote-app/api/health` returns HTTP 200 `{ ok: true }` without touching any domain service or database.

---

### Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| F1 | Multi-Zones Process Isolation | Shell and zone run as independent processes communicating over HTTP | M1, M2, M3 | survey (00-arquitetura.md §1, §3) |
| F2 | Shell Rewrites Proxying | Shell proxies `/remote-app/**` and `/remote-app-static/**` to port 3001 | M2 | survey (01-operacao.md §1.1) |
| F3 | Separate Zone Root Rewrite Rule | Explicit rewrite rule for `/remote-app` to avoid 404 | M2 | survey (01-operacao.md §1.1; ORIGINAL_REQUEST R3) |
| F4 | Zone Base Path & Asset Prefix | `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'` | M1 | survey (01-operacao.md §1.2; ORIGINAL_REQUEST R2) |
| F5 | Shell Non-Delegated Route Protection | Reserved shell routes (`/`, `/api/*`) are not delegated | M2 | survey (00-arquitetura.md §2.3) |
| F6 | Plain HTML `<a>` Navigation | All cross-zone links use `<a>`, never `<Link>` | M2 | survey (00-arquitetura.md §7.2; ORIGINAL_REQUEST R4) |
| F7 | Shell DAL Exclusion | Shell contains no DAL, domain fetch, or business logic | M2 | survey (02-zonas.md §1.2; ORIGINAL_REQUEST Invariants) |
| F8 | Health Check Endpoint | `GET /remote-app/api/health` returns 200 `{ ok: true }` without domain I/O | M1 | survey (01-operacao.md §5.2; ORIGINAL_REQUEST R5) |
| F9 | Fragment Endpoint | `GET /remote-app/_fragmento/{name}/{id}` serves inert HTML | M1 | survey (00-arquitetura.md §6; ORIGINAL_REQUEST R5) |
| F10 | Inert Fragment HTML Guarantee | HTML contains zero `<script>` tags or event handlers | M1 | survey (02-zonas.md §2.3; ORIGINAL_REQUEST Invariants) |
| F11 | Unified 204 Error Masking | 204 for both unknown and unauthorized fragments (no 403) | M1 | survey (02-zonas.md §2.2; ORIGINAL_REQUEST Invariants) |
| F12 | Identity via Cookie Forwarding | Callee resolves `__Host-session`, no caller header assertions | M1 | survey (02-zonas.md §2.1) |
| F13 | Fragment Circuit Breaker & Timeout | Fallback and timeout on foreign fragment fetch | M1 | survey (00-arquitetura.md §6.2) |
| F14 | TypeScript Exact Optional Property Types | `exactOptionalPropertyTypes: true` enforced in zone tsconfig | M1 | survey (00-arquitetura.md §5.1; ORIGINAL_REQUEST R2) |
| F15 | Federation Package Purge | Removal of `@module-federation/*` and webpack overrides | M1, M2, M3 | survey (ORIGINAL_REQUEST R3, R6) |
| F16 | App Rename `apps/remote` -> `apps/remote-app` | Folder and package renamed; workspace scripts updated | M1 | survey (ORIGINAL_REQUEST R1) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Test infrastructure, 4-tier opaque-box test suites, TEST_READY.md | none | DONE |
| M1 | Remote App Zone (`apps/remote-app`) | R1, R2, R5: Rename to `apps/remote-app`, configure basePath/assetPrefix, tsconfig exactOptionalPropertyTypes, types/index.ts, health API, _fragmento endpoint & rewrite, unit tests | none | DONE |
| M2 | Host Shell Gateway (`apps/host`) | R3, R4: Delete deprecated files, configure 3 rewrites, rewrite index.tsx, update HostLayout/SideNavigation/Header, rewrites test | M1 | READY |
| M3 | Workspace Purge & Final E2E Pass | R6: Strip workspace federation overrides, clean pnpm install, zero-grep audit, 100% E2E test pass | M1, M2, E2E | PLANNED |

---

## Interface Contracts

### Host Gateway (`apps/host`) ↔ Remote Zone (`apps/remote-app`)
- **Port Assignment**: Shell runs on port 3000; Remote App runs on port 3001.
- **Rewrites (HTTP Proxying)**:
  - `GET /remote-app` -> `http://localhost:3001/remote-app` (200 OK)
  - `GET /remote-app/:path*` -> `http://localhost:3001/remote-app/:path*`
  - `GET /remote-app-static/:path*` -> `http://localhost:3001/remote-app-static/:path*`
- **Health Check Contract**:
  - `GET /remote-app/api/health` -> HTTP 200, `Content-Type: application/json`, Body: `{"ok":true}`. Zero domain I/O.
- **Fragment Contract**:
  - `GET /remote-app/_fragmento/{name}/{id}`
  - If `method !== 'GET'`: HTTP 405 Method Not Allowed
  - If `name === 'demo'`: HTTP 200 OK, `Content-Type: text/html; charset=utf-8`, Body: `<div class="fragment fragment--demo"><p>Demo fragment (id: ${safeId})</p></div>` (No `<script>` tags)
  - If `name !== 'demo'`: HTTP 204 No Content (Empty body, no 403)

---

## Code Layout & Write Ownership

| Milestone | Exclusively Owned Files |
|-----------|-------------------------|
| **M1** | `apps/remote` -> `apps/remote-app/` (rename), `apps/remote-app/package.json`, `apps/remote-app/next.config.js`, `apps/remote-app/tsconfig.json`, `apps/remote-app/types/index.ts`, `apps/remote-app/pages/api/health.ts`, `apps/remote-app/pages/_fragmento/[name]/[id].tsx`, `apps/remote-app/pages/api/fragmento/[name]/[id].ts` (optional rewrite target), `apps/remote-app/test/next-config.test.ts`, `apps/remote-app/test/health.test.ts`, `apps/remote-app/test/fragmento.test.ts`, root `package.json` (script filters) |
| **M2** | `apps/host/next.config.js`, `apps/host/pages/index.tsx`, `apps/host/components/HostLayout.tsx`, `apps/host/components/SideNavigation.tsx`, `apps/host/components/Header.tsx`, `apps/host/test/rewrites.test.ts`, `apps/host/package.json`, deleted files (`safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `declarations.d.ts`, `RemoteFallbackCard.tsx`) |
| **M3** | `pnpm-workspace.yaml`, `.npmrc`, root lockfile / verification scripts |
| **E2E** | `test/e2e/**`, `scripts/smoke-test.mjs`, `TEST_INFRA.md`, `TEST_READY.md` |

