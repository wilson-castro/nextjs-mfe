## 2026-09-11T12:53:50Z
<USER_REQUEST>
You are the Milestone 1 Edge Cases & Invariants Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_3
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md
Read survey report at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_remote_2/handoff.md

Your Scope: Milestone 1 Edge Cases, Invariants, and Failure Defense (R1, R2, R5)
Investigate all potential failure modes and produce defensive guidelines for the Worker:
1. Next.js Pages Router underscore routing:
   - Verify how Pages Router handles `pages/_fragmento/`. Since folders prefixed with `_` are ignored by default file-system routing, how should the zone rewrite or route structure be set up so both unit tests (`import handler from '../pages/_fragmento/[name]/[id]'`) and live HTTP requests succeed?
2. `exactOptionalPropertyTypes: true`:
   - Identify every file in `apps/remote` that can fail typecheck when this flag is enabled.
   - Detail the exact type modifications in `types/index.ts` to keep the code 100% type-safe without disabling the compiler flag.
3. Package rename and workspace integrity:
   - Verify pnpm workspace symlinking when renaming `@mfe/remote` to `remote-app`.
   - Verify root `package.json` script dependencies.
4. Clean federation removal:
   - Verify no orphaned federation imports remain in `apps/remote-app`.
5. Write your complete handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_3/handoff.md`.
6. Notify parent via send_message when complete. Do NOT modify source code.
</USER_REQUEST>
