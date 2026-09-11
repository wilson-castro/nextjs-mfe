## 2026-09-11T13:03:04Z

You are the Milestone 1 Worker for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/worker_m1
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read the Explorer reports:
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_1/handoff.md
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_2/handoff.md
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Write Ownership:
You own exclusively:
- `apps/remote` -> `apps/remote-app` (move directory and clean up any remnant untracked files in `apps/remote`)
- `apps/remote-app/package.json`
- `apps/remote-app/next.config.js`
- `apps/remote-app/tsconfig.json`
- `apps/remote-app/types/index.ts`
- `apps/remote-app/pages/api/health.ts`
- `apps/remote-app/pages/_fragmento/[name]/[id].tsx`
- `apps/remote-app/pages/api/fragmento/[name]/[id].ts`
- `apps/remote-app/test/next-config.test.ts`
- `apps/remote-app/test/health.test.ts`
- `apps/remote-app/test/fragmento.test.ts`
- Monorepo root `package.json` (update script filters to `--filter remote-app`)

Execution Tasks:
1. Rename directory `apps/remote` to `apps/remote-app` using `git mv apps/remote apps/remote-app`. If untracked node_modules remain in `apps/remote`, remove `apps/remote`.
2. In `apps/remote-app/package.json`:
   - Set `"name": "remote-app"`
   - Remove `@module-federation/nextjs-mf` dependency
   - In `"scripts"`, remove `NEXT_PRIVATE_LOCAL_WEBPACK=true` and add `"test": "npx tsx --test test/*.test.ts"`
3. In root `package.json`:
   - Update lines 6, 9, 12, 15 from `--filter @mfe/remote` to `--filter remote-app`
4. Run `pnpm install` from root to refresh workspace symlinks.
5. In `apps/remote-app/next.config.js`:
   - Set `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'`, `reactStrictMode: true`
   - Remove `NextFederationPlugin` and Webpack federation configuration
   - Add internal rewrite mapping `/_fragmento/:name/:id` to `/api/fragmento/:name/:id` to solve Pages Router underscore routing exclusion
6. In `apps/remote-app/tsconfig.json`:
   - Add `"exactOptionalPropertyTypes": true` to `compilerOptions`
7. In `apps/remote-app/types/index.ts`:
   - Add `| undefined` to optional fields in `ServerCardProps`, `RemoteMapProps`, `RemoteTelemetryProps`, `ServerPayload` to eliminate the 5 TS2375 compiler errors
8. Create `apps/remote-app/pages/api/health.ts`:
   - `GET` returns 200 `{ ok: true }` without domain I/O
9. Create `apps/remote-app/pages/_fragmento/[name]/[id].tsx`:
   - Non-GET returns 405
   - Known fragment (`demo`) returns 200 `text/html; charset=utf-8` with encoded `safeId` and strictly NO `<script>` tags
   - Unknown fragment returns 204 (empty body)
10. Create `apps/remote-app/pages/api/fragmento/[name]/[id].ts`:
    - Re-exports default handler from `../../../_fragmento/[name]/[id]`
11. Create unit tests in `apps/remote-app/test/` using `node:test` and `node:assert/strict`:
    - `test/next-config.test.ts`
    - `test/health.test.ts`
    - `test/fragmento.test.ts`
12. Run verification commands:
    - `cd apps/remote-app && rtk npx tsx --test test/*.test.ts`
    - `cd apps/remote-app && rtk tsc --noEmit`
    - `rtk grep "@module-federation|remoteEntry|NextFederationPlugin" apps/remote-app/`
    - `pnpm --filter remote-app typecheck`
13. Write full handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/worker_m1/handoff.md`.
14. Send completion message to parent (ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2).
