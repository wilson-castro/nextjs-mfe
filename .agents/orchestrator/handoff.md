# Orchestrator Soft Handoff — Generation 1 to Generation 2

**Predecessor**: Project Orchestrator Generation 1 (`012e9e76-2bff-4cfd-a734-2b498b65bab2`)  
**Parent (Sentinel)**: `04df880a-3bd4-46fd-bdc7-55c4fa5cfd24`  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/orchestrator`  
**Workspace**: `/home/gabrigas/Selene/Adventure/nextjs-mfe`  
**Trigger**: Cumulative spawn count reached 17 / 16 and all subagents completed.

---

## 1. Milestone State

| Milestone | Scope | Status | Notes |
|-----------|-------|--------|-------|
| **E2E Testing Track** | Test infra, 4-tier matrix, `TEST_READY.md`, `scripts/smoke-test.mjs` | **DONE** | Complete test harness implemented; supports `--offline` static checks and live HTTP smoke testing |
| **Milestone 1 (M1)** | `apps/remote-app` (R1, R2, R5) | **DONE** | Renamed `apps/remote` -> `apps/remote-app`, `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'`, `exactOptionalPropertyTypes: true`, `types/index.ts` clean, health API (200 / 405), `_fragmento` (200 / 204 / 405 / no `<script>`), 13/13 unit tests pass, tsc clean, production build clean, live HTTP verified, Forensic Auditor: **CLEAN** |
| **Milestone 2 (M2)** | `apps/host` Gateway Shell (R3, R4) | **READY** | Immediate next milestone for Successor Gen 2 |
| **Milestone 3 (M3)** | Workspace Purge & Final E2E Pass (R6) | **PLANNED** | Scheduled after Milestone 2 |

---

## 2. Active Subagents

- None. All 17 subagents spawned by Generation 1 have delivered their handoff reports and are retired:
  - `survey_miner_1` (spec miner)
  - `survey_remote_2` (remote explorer)
  - `survey_host_3` (host explorer)
  - `test_writer_e2e` (test writer)
  - `explorer_m1_1`, `explorer_m1_2`, `explorer_m1_3` (M1 explorers)
  - `worker_m1` (M1 worker iter 1)
  - `reviewer_m1_1`, `reviewer_m1_2`, `challenger_m1_1`, `challenger_m1_2`, `auditor_m1_1` (M1 verifiers iter 1)
  - `worker_m1_fix` (M1 worker iter 2)
  - `reviewer_m1_3`, `challenger_m1_3`, `auditor_m1_2` (M1 verifiers iter 2)
- **Iron Rule**: Never reuse retired subagents; always spawn fresh subagents with distinct working directories (e.g. `.agents/explorer_m2_1`, `.agents/worker_m2`, etc.).

---

## 3. Pending Decisions & Technical Invariants

1. **Milestone 2 Requirements (`apps/host`)**:
   - **R3 (Shell Multi-Zones Rewrites)**:
     - In `apps/host/next.config.js`:
       - Define 3 rewrites:
         1. `/remote-app` -> `http://localhost:3001/remote-app` (explicit zone root)
         2. `/remote-app/:path*` -> `http://localhost:3001/remote-app/:path*` (sub-routes)
         3. `/remote-app-static/:path*` -> `http://localhost:3001/remote-app-static/:path*` (static assets)
       - Strip `@module-federation/nextjs-mf` and NextFederationPlugin completely.
   - **R4 (Host Decoupling & Deprecated File Removal)**:
     - Delete:
       - `apps/host/lib/safeRemoteLoader.ts`
       - `apps/host/components/FederatedErrorBoundary.tsx`
       - `apps/host/components/RemoteCardClientWrapper.tsx`
       - `apps/host/declarations.d.ts`
     - Rewrite `apps/host/pages/index.tsx`:
       - Show shell diagnostics and navigation links.
       - Use plain HTML `<a href="/remote-app">Remote Dashboard</a>`, strictly NEVER Next.js `<Link href="/remote-app">` (cross-zone navigation invariant).
       - NO Domain Access Layer (DAL) or business data fetching in the shell.
     - Update layout & navigation components:
       - `apps/host/components/HostLayout.tsx`, `SideNavigation.tsx`, and `Header.tsx` (remove federation `isRemoteAvailable` prop / federation state).
     - Create unit test: `apps/host/test/rewrites.test.ts` asserting the 3 rewrites using Node.js `node:test` + `node:assert/strict`.

2. **Test Runner Convention**:
   - The workspace does not use Jest or Vitest; it uses Node.js built-ins `node:test` and `node:assert/strict` executed via `rtk npx tsx --test test/*.test.ts`.

3. **Integrity Invariant**:
   - DISPATCH-ONLY. Never write source code or run build/test commands directly. Subagents execute all changes and tests.
   - Forensic Auditor report is a BINARY VETO.

---

## 4. Remaining Work (Concrete Next Steps for Successor)

1. **Initialize Gen 2 State**:
   - Read `BRIEFING.md`, `progress.md`, `PROJECT.md`, `ORIGINAL_REQUEST.md`, and this `handoff.md`.
   - Start a recurring heartbeat cron: `schedule(CronExpression="*/10 * * * *", Prompt="Heartbeat tick: check subagent progress and update progress.md")`.
   - Reset spawn count for Generation 2 (`0 / 16`).

2. **Execute Milestone 2 (Host Shell Gateway)**:
   - **Step 2A**: Spawn 3 Explorers in parallel (`explorer_m2_1`, `explorer_m2_2`, `explorer_m2_3`) with working directories under `.agents/`:
     - `explorer_m2_1`: Plan exact deletions, `apps/host/next.config.js` rewrites, and `package.json` updates.
     - `explorer_m2_2`: Plan `pages/index.tsx`, `HostLayout.tsx`, `SideNavigation.tsx`, `Header.tsx` refactoring (plain `<a>`, zero DAL).
     - `explorer_m2_3`: Plan unit tests in `apps/host/test/rewrites.test.ts` and verification commands.
   - **Step 2B**: Spawn `worker_m2` with Explorer findings:
     - Delete the 4 deprecated files.
     - Update `apps/host/next.config.js` and `apps/host/package.json`.
     - Update `pages/index.tsx`, `HostLayout.tsx`, `SideNavigation.tsx`, `Header.tsx`.
     - Create `apps/host/test/rewrites.test.ts`.
     - Verify: `cd apps/host && rtk npx tsx --test test/*.test.ts`, `rtk tsc --noEmit`, `rtk next build`.
   - **Step 2C**: Spawn Verification Triad:
     - Reviewer (`teamwork_preview_reviewer`)
     - Challenger (`teamwork_preview_challenger`)
     - Forensic Auditor (`teamwork_preview_auditor`)
   - **Step 2D**: Gate Check -> `GATE_STATUS.md` -> Mark M2 `DONE` in `PROJECT.md`.

3. **Execute Milestone 3 (Workspace Purge & Final E2E Verification)**:
   - Strip `@module-federation/*` overrides from `pnpm-workspace.yaml` and `.npmrc`.
   - Run `pnpm install` cleanly.
   - Verify zero grep matches across `apps/`.
   - Run full E2E test suite: `node scripts/smoke-test.mjs --strict`.
   - Forensic Victory Audit.
   - Report project completion to parent (Sentinel: `04df880a-3bd4-46fd-bdc7-55c4fa5cfd24`) via `send_message`.

---

## 5. Key Artifacts

- Global Architecture & Milestones: `/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md`
- Original User Request: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md`
- Orchestrator Persistent Briefing: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/orchestrator/BRIEFING.md`
- Orchestrator Progress Log: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/orchestrator/progress.md`
- Gate Status Log: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/orchestrator/GATE_STATUS.md`
- E2E Test Infra: `/home/gabrigas/Selene/Adventure/nextjs-mfe/TEST_INFRA.md`
- E2E Test Suite Ready: `/home/gabrigas/Selene/Adventure/nextjs-mfe/TEST_READY.md`
- Runnable Test Harness: `/home/gabrigas/Selene/Adventure/nextjs-mfe/scripts/smoke-test.mjs`
