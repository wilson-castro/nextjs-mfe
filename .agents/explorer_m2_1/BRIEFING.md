# BRIEFING — 2026-09-11T13:59:00Z

## Mission
Explore and provide a comprehensive, concrete implementation specification for Milestone 2 (Configuration & Deprecated Files) for the host app.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_1
- Original parent: 012e9e76-2bff-4cfd-a734-2b498b65bab2
- Milestone: Milestone 2 Configuration & Deprecated Files (R3, R4)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code
- Provide comprehensive, concrete implementation specification for the Worker

## Current Parent
- Conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2
- Updated: 2026-09-11T13:54:08Z

## Investigation State
- **Explored paths**: `apps/host/package.json`, `apps/host/next.config.js`, `apps/host/declarations.d.ts`, `apps/host/next-env.d.ts`, `apps/host/lib/safeRemoteLoader.ts`, `apps/host/components/FederatedErrorBoundary.tsx`, `apps/host/components/RemoteCardClientWrapper.tsx`, `apps/host/components/RemoteFallbackCard.tsx`, `apps/remote-app/test/next-config.test.ts`, `scripts/smoke-test.mjs`, `test/e2e/static-invariants.mjs`.
- **Key findings**:
  1. Deprecated files to delete: `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `declarations.d.ts`, plus orphaned `RemoteFallbackCard.tsx`.
  2. `next-env.d.ts` is standard Next.js types and must be retained.
  3. `package.json` needs removal of `@module-federation/nextjs-mf` and `NEXT_PRIVATE_LOCAL_WEBPACK=true`, addition of `"test": "npx tsx --test test/*.test.ts"`.
  4. `next.config.js` requires 3 separate rewrites (`/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*`) with env fallback `REMOTE_APP_URL || REMOTE_ZONE_URL || 'http://localhost:3001'`.
- **Unexplored areas**: None within Milestone 2 config/deletion scope.

## Key Decisions Made
- Prepared concrete code specifications for `next.config.js`, `package.json`, `test/rewrites.test.ts`, and full deletion list in `handoff.md`.
- Specified environment variable resolution supporting both `REMOTE_APP_URL` and `REMOTE_ZONE_URL`.

## Artifact Index
- DISPATCH.md — Task dispatch record
- progress.md — Heartbeat and progress tracking
- handoff.md — Final implementation specification for Worker
