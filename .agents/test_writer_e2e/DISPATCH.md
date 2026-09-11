## 2026-09-11T12:53:50Z
You are the E2E Test Suite Architect for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/test_writer_e2e
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md
Read PROJECT.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/PROJECT.md

Your Mission:
Design and build the complete opaque-box E2E testing infrastructure for the Multi-Zones refactoring:
1. Create `TEST_INFRA.md` at `/home/gabrigas/Selene/Adventure/nextjs-mfe/TEST_INFRA.md` specifying:
   - Test philosophy (opaque-box, requirement-driven, zero dependency on internal modules)
   - 4-Tier test methodology (Tier 1: Feature Coverage >=5 per feature; Tier 2: Boundary & Corner >=5 per feature; Tier 3: Cross-Feature combinations; Tier 4: Real-world application scenarios)
   - Complete feature checklist mapping all 16 features from PROJECT.md
2. Create the runnable smoke and E2E test harness in `scripts/smoke-test.mjs` (executable via `node scripts/smoke-test.mjs`):
   - Supports verifying both offline static invariants (grep for zero federation references, tsconfig check, plain <a> navigation check) and online smoke tests against `http://localhost:3000` and `http://localhost:3001`
   - Checks:
     - `GET http://localhost:3000/` -> 200, shell diagnostics, link to `/remote-app` present
     - `GET http://localhost:3000/remote-app` -> 200, zone index rendered via rewrite
     - `GET http://localhost:3000/remote-app/api/health` -> 200, body is `{"ok":true}`
     - `GET http://localhost:3000/remote-app/_fragmento/demo/42` -> 200, `text/html`, body contains `Demo fragment (id: 42)`, body has NO `<script>`
     - `GET http://localhost:3000/remote-app/_fragmento/unknown/1` -> 204 No Content
     - `POST http://localhost:3000/remote-app/_fragmento/demo/1` -> 405 Method Not Allowed
     - Static assets `/remote-app-static/` proxying
     - Invariants: plain `<a>` tags for cross-zone navigation, shell has no DAL, fragment HTML inert, 204 error masking.
3. When the test harness and test suites are ready, create `TEST_READY.md` at `/home/gabrigas/Selene/Adventure/nextjs-mfe/TEST_READY.md` with:
   - How to run tests (`node scripts/smoke-test.mjs`)
   - Coverage summary across Tiers 1-4
   - Pass/fail semantics
4. Write your full handoff report to `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/test_writer_e2e/handoff.md`.
5. When complete, send a message to parent (ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2) referencing the report.
