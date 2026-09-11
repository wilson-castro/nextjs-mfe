# Original User Request

## Initial Request — 2026-09-11T12:43:54Z

Refactor the `nextjs-mfe` PoC from Module Federation (`@module-federation/nextjs-mf`) to native Next.js Multi-Zones, following the architecture described in Wilson Castro's docs (`docs/design-bff/mfe/`).

Working directory: `/home/gabrigas/Selene/Adventure/nextjs-mfe`
Integrity mode: development

---

## Requirements

### R1. Rename `apps/remote` → `apps/remote-app` and update workspace
The directory and `package.json` `name` field must be renamed. The pnpm workspace must install cleanly after the rename.

### R2. Configure `apps/remote-app` as a Multi-Zones zone
`next.config.js` must set `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`. The zone's `tsconfig.json` must include `exactOptionalPropertyTypes: true`.

### R3. Reconfigure `apps/host` shell with Multi-Zones rewrites
Replace the `NextFederationPlugin` with `async rewrites()` covering three rules: the zone root, zone sub-routes, and zone static assets. Remove `@module-federation/nextjs-mf` from both apps and strip Federation-related overrides from `pnpm-workspace.yaml`.

### R4. Remove federated lazy imports from host; cross-zone navigation via `<a>`
Delete `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, and `declarations.d.ts`. Rewrite `pages/index.tsx` to render shell diagnostics and a plain `<a href="/remote-app">` for zone navigation. Update `HostLayout` and `SideNavigation` to remove Federation-only props and use `<a>` for cross-zone links.

### R5. Add zone health check and `_fragmento` stub to `apps/remote-app`
- `GET /remote-app/api/health` returns `{ ok: true }` with no domain I/O.
- `GET /remote-app/_fragmento/{name}/{id}` returns 200 `text/html` (no `<script>` tags) for known fragment names or `204` for unknown/unauthorized. `204` covers both cases — the consumer must not be able to distinguish them. Only `GET` is accepted; all other methods return `405`.

### R6. Final cleanup and end-to-end verification
Grep confirms zero references to `@module-federation`, `remoteEntry`, `NextFederationPlugin`, or `remote/ServerCard`. All tests pass. Both apps start and the smoke test passes.

---

## Acceptance Criteria

### Config
- [ ] `apps/remote-app/next.config.js` exports `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'` — verified by `test/next-config.test.ts` (PASS).
- [ ] `apps/host/next.config.js` exports `async rewrites()` with sources `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*` — verified by `test/rewrites.test.ts` (PASS).

### Tests
- [ ] `apps/remote-app/test/health.test.ts` — PASS (200 `{ ok: true }`).
- [ ] `apps/remote-app/test/fragmento.test.ts` — PASS (200 text/html no `<script>`, 204 for unknown, 405 for POST).
- [ ] `apps/host/test/rewrites.test.ts` — PASS.
- [ ] `apps/remote-app/test/next-config.test.ts` — PASS.

### Cleanliness
- [ ] `rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/` returns zero matches.
- [ ] `pnpm install` completes without error after Federation packages are removed.
- [ ] `npx tsc --noEmit` in `apps/host` returns zero errors.

### Smoke test (both apps running)
- [ ] `GET http://localhost:3000/` renders shell; no Federation errors in browser console.
- [ ] `GET http://localhost:3000/remote-app` renders zone index (served via shell rewrite).
- [ ] `GET http://localhost:3000/remote-app/api/health` returns `{"ok":true}`.
- [ ] `GET http://localhost:3000/remote-app/_fragmento/demo/42` returns 200, `Content-Type: text/html`, body has no `<script>`.
- [ ] `GET http://localhost:3000/remote-app/_fragmento/unknown/1` returns 204.

### Architecture invariants (from `docs/design-bff/mfe/`)
- [ ] No `<Link>` component points outside its own zone prefix — all cross-zone navigation uses plain `<a>`.
- [ ] Shell (`apps/host`) contains no DAL, no domain fetch, no business logic.
- [ ] Fragment HTML contains no `<script>` tags.
- [ ] `204` is the only non-2xx success status for the `_fragmento` endpoint — no `403`.

---

## Reference Material

- `docs/design-bff/mfe/00-arquitetura.md` — full architecture
- `docs/design-bff/mfe/01-operacao.md` — routing table, session, deploy order
- `docs/design-bff/mfe/02-zonas.md` — zone structure, fragment contract
- `docs/superpowers/plans/2026-09-11-multizone-refactor.md` — full implementation plan with TDD steps and exact code for every task
