## 2026-09-11T13:54:01Z

You are the Milestone 2 Configuration & Deletion Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_1
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read survey report at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_host_3/handoff.md

Your Scope: Milestone 2 Configuration & Deprecated Files (R3, R4)
Provide a comprehensive, concrete implementation specification for the Worker:
1. Exact deprecated files to delete in `apps/host`:
   - `apps/host/lib/safeRemoteLoader.ts`
   - `apps/host/components/FederatedErrorBoundary.tsx`
   - `apps/host/components/RemoteCardClientWrapper.tsx`
   - `apps/host/declarations.d.ts`
   Verify if any other federation files or declarations exist.
2. Exact modifications to `apps/host/package.json`:
   - Remove `@module-federation/nextjs-mf` from dependencies.
   - In `"scripts"`, remove `NEXT_PRIVATE_LOCAL_WEBPACK=true` from `dev`, `build`, `start`.
   - Add `"test": "npx tsx --test test/*.test.ts"` to scripts.
3. Multi-Zones Gateway configuration in `apps/host/next.config.js`:
   - Remove `NextFederationPlugin` and Webpack federation hooks completely.
   - Add `reactStrictMode: true`.
   - Implement `async rewrites()` returning an array with 3 distinct rewrite rules:
     1. `{ source: '/remote-app', destination: 'http://localhost:3001/remote-app' }`
     2. `{ source: '/remote-app/:path*', destination: 'http://localhost:3001/remote-app/:path*' }`
     3. `{ source: '/remote-app-static/:path*', destination: 'http://localhost:3001/remote-app-static/:path*' }`
   - Verify fallback or environment variable convention (e.g. `process.env.REMOTE_APP_URL || 'http://localhost:3001'`).
4. Write your complete handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_1/handoff.md`.
5. Notify parent via send_message when complete. Do NOT modify source code.
