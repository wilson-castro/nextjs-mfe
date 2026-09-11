## 2026-09-11T12:53:50Z

You are the Milestone 1 Spec & Strategy Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_1
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read survey report at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_remote_2/handoff.md

Your Scope: Milestone 1 (Remote App Zone: R1, R2, R5)
Provide a comprehensive, concrete implementation specification for the Worker:
1. Exact file operations:
   - `git mv apps/remote apps/remote-app`
   - `apps/remote-app/package.json` updates (`name: "remote-app"`, remove `@module-federation/nextjs-mf`, remove `NEXT_PRIVATE_LOCAL_WEBPACK=true`)
   - Root `package.json` updates (update script filters to `--filter remote-app`)
2. Multi-Zones zone configuration in `apps/remote-app/next.config.js`:
   - `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'`, `reactStrictMode: true`
   - Remove `NextFederationPlugin` and webpack federation hook
   - Add internal rewrite for `/_fragmento/:name/:id` so Next.js Pages Router dispatches it properly
3. Exact TypeScript configuration in `apps/remote-app/tsconfig.json`:
   - `"exactOptionalPropertyTypes": true`
4. Exact fixes in `apps/remote-app/types/index.ts`:
   - Add `| undefined` to optional properties in `ServerCardProps`, `RemoteMapProps`, `RemoteTelemetryProps` to eliminate the 5 TS2375 errors
5. Health Check implementation: `apps/remote-app/pages/api/health.ts` (GET -> 200 `{ ok: true }`, zero domain I/O)
6. Fragment endpoint implementation: `apps/remote-app/pages/_fragmento/[name]/[id].tsx` (and re-export API route if needed)
7. Unit tests in `apps/remote-app/test/`:
   - `test/next-config.test.ts`
   - `test/health.test.ts`
   - `test/fragmento.test.ts`
   (Using `node:test` and `node:assert/strict`)
8. Write your complete handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_1/handoff.md`.
9. Notify parent via send_message when complete. Do NOT modify source code.
