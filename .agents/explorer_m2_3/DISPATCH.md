## 2026-09-11T13:54:01Z

You are the Milestone 2 Test & Verification Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_3
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read survey report at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_host_3/handoff.md

Your Scope: Milestone 2 Test Suite & Invariants Verification (R3, R4)
Provide a comprehensive specification of tests and verification commands for the Worker:
1. Unit test suite: `apps/host/test/rewrites.test.ts`:
   - Must use Node.js built-ins `import test from 'node:test'` and `import assert from 'node:assert/strict'`.
   - Must import `apps/host/next.config.js`.
   - Must call `rewrites()` and assert:
     1. Array contains 3 rewrites.
     2. Rewrite 1: `source === '/remote-app'`, `destination === 'http://localhost:3001/remote-app'` (or URL ending in `/remote-app`).
     3. Rewrite 2: `source === '/remote-app/:path*'`, `destination === 'http://localhost:3001/remote-app/:path*'`.
     4. Rewrite 3: `source === '/remote-app-static/:path*'`, `destination === 'http://localhost:3001/remote-app-static/:path*'`.
2. Static invariants check:
   - Verify `node scripts/smoke-test.mjs --offline` passes all static checks (STATIC-01 to STATIC-06) once Milestone 2 changes land.
   - Verify `rtk rg "@module-federation|remoteEntry|NextFederationPlugin|safeRemoteLoader" apps/host/` returns 0 matches.
   - Verify `apps/host/lib/safeRemoteLoader.ts` and other 3 deprecated files do not exist on disk.
3. TypeScript check & build:
   - `cd apps/host && rtk tsc --noEmit`
   - `cd apps/host && rtk proxy pnpm run build`
4. Write your complete handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_3/handoff.md`.
5. Notify parent via send_message when complete. Do NOT modify source code.
