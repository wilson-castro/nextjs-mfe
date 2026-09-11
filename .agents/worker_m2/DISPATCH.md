## 2026-09-11T14:01:53Z

You are the Milestone 2 Implementation Worker for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/worker_m2
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read the Explorer reports:
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_1/handoff.md
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_2/handoff.md
- /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Write Ownership:
You own exclusively:
- `apps/host/package.json`
- `apps/host/next.config.js`
- `apps/host/pages/index.tsx`
- `apps/host/components/Header.tsx`
- `apps/host/components/HostLayout.tsx`
- `apps/host/components/SideNavigation.tsx`
- `apps/host/test/rewrites.test.ts`
- Deletion of:
  - `apps/host/lib/safeRemoteLoader.ts`
  - `apps/host/components/FederatedErrorBoundary.tsx`
  - `apps/host/components/RemoteCardClientWrapper.tsx`
  - `apps/host/declarations.d.ts`
  - `apps/host/components/RemoteFallbackCard.tsx`
  - `apps/host/tsconfig.tsbuildinfo` (if present)

Execution Tasks:
1. Delete the 5 deprecated/orphaned files:
   - `rm apps/host/lib/safeRemoteLoader.ts`
   - `rm apps/host/components/FederatedErrorBoundary.tsx`
   - `rm apps/host/components/RemoteCardClientWrapper.tsx`
   - `rm apps/host/declarations.d.ts`
   - `rm apps/host/components/RemoteFallbackCard.tsx`
   - `rm -f apps/host/tsconfig.tsbuildinfo`
2. Update `apps/host/package.json`:
   - Remove `"@module-federation/nextjs-mf": "^8.8.74"` from `dependencies`.
   - In `"scripts"`, remove `NEXT_PRIVATE_LOCAL_WEBPACK=true` prefix from `dev` and `build`.
   - Add `"test": "npx tsx --test test/*.test.ts"` to scripts.
   - Run `pnpm install` from root to refresh lockfile.
3. Update `apps/host/next.config.js`:
   - Completely remove `NextFederationPlugin` and Webpack hooks.
   - Set `reactStrictMode: true`.
   - Configure `async rewrites()` returning an array with 3 distinct rewrite rules using `const remoteZoneUrl = process.env.REMOTE_ZONE_URL || process.env.REMOTE_APP_URL || 'http://localhost:3001'`:
     1. `{ source: '/remote-app', destination: `${remoteZoneUrl}/remote-app` }`
     2. `{ source: '/remote-app/:path*', destination: `${remoteZoneUrl}/remote-app/:path*` }`
     3. `{ source: '/remote-app-static/:path*', destination: `${remoteZoneUrl}/remote-app-static/:path*` }`
4. Refactor `apps/host/components/Header.tsx`:
   - Remove `isRemoteAvailable` requirement from `HeaderProps` (or make optional).
   - System pill displays Multi-Zones Shell Gateway status (`Multi-Zones Gateway (Port 3000)`).
5. Refactor `apps/host/components/HostLayout.tsx`:
   - Remove `isRemoteAvailable`, `currentTab`, and `onTabSelect` props.
   - Cleanly wrap `Header`, `SideNavigation`, and `children`.
6. Refactor `apps/host/components/SideNavigation.tsx`:
   - Replace tab buttons with native navigation links:
     - Shell Home (`/`)
     - Remote App Zone (`/remote-app`), using plain HTML `<a>` tags with classes `.nav-link` matching `apps/host/styles/globals.css`.
     - Update badge to "Next.js Multi-Zones" / "Native HTTP Zone Routing".
7. Rewrite `apps/host/pages/index.tsx`:
   - Display shell overview and Multi-Zones architecture diagnostics.
   - Cross-zone link to `/remote-app` MUST use plain HTML `<a href="/remote-app">...</a>`, NEVER Next.js `<Link>` (architectural invariant F6).
   - Shell DAL Exclusion (invariant F7): `getServerSideProps` only provides shell runtime metadata (`hostRenderTimestamp`, `initialSession`), zero domain HTTP calls or business data fetching.
8. Create `apps/host/test/rewrites.test.ts`:
   - Use Node.js `node:test` and `node:assert/strict`.
   - Test that rewrites is an async function.
   - Test that rewrites returns an array with exactly 3 rules matching the 3 sources and destinations.
   - Test dynamic environment variable override (`REMOTE_ZONE_URL`).
9. Run verification commands:
   - `cd apps/host && rtk npx tsx --test test/*.test.ts`
   - `cd apps/host && rtk tsc --noEmit`
   - `cd apps/host && rtk proxy pnpm run build`
   - `node scripts/smoke-test.mjs --offline` (verify 100% of static invariants pass)
   - `rtk rg "@module-federation|remoteEntry|NextFederationPlugin|safeRemoteLoader" apps/host/` (zero matches)
10. Write full handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/worker_m2/handoff.md`.
11. Send completion message to parent (`012e9e76-2bff-4cfd-a734-2b498b65bab2`).
