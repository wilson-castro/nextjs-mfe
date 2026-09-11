## 2026-09-11T13:54:01Z

You are the Milestone 2 UI & Navigation Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_2
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read survey report at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_host_3/handoff.md

Your Scope: Milestone 2 Shell UI & Navigation Architecture (R4)
Provide a comprehensive, concrete refactoring specification for the Worker:
1. `apps/host/pages/index.tsx`:
   - Inspect current implementation: it currently uses `RemoteCardClientWrapper`, `FederatedErrorBoundary`, `safeRemoteLoader`, and federated lazy imports.
   - Provide the complete, clean replacement code:
     - Shell homepage displaying system overview / architecture diagnostics.
     - Cross-zone navigation link to `/remote-app`: MUST use plain HTML `<a href="/remote-app">...</a>`, NEVER Next.js `<Link href="/remote-app">` (architectural invariant: cross-zone navigation triggers a full page load so remote scripts/assets load cleanly).
     - Shell DAL exclusion: Absolutely NO Domain Access Layer, business data fetching, or remote federation imports.
2. `apps/host/components/Header.tsx`, `HostLayout.tsx`, `SideNavigation.tsx`:
   - Inspect how `isRemoteAvailable` or federation state is passed across these components.
   - Specify exact changes to decouple them: remove `isRemoteAvailable` or make it optional / remove federation health polling that was specific to Module Federation remoteEntry.js.
   - In `SideNavigation.tsx`, ensure any link pointing to `/remote-app` uses plain HTML `<a>` instead of Next.js `<Link>`.
3. Check TypeScript interfaces in `apps/host`: ensure no remaining references to deleted files or federation types.
4. Write your complete handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_2/handoff.md`.
5. Notify parent via send_message when complete. Do NOT modify source code.
