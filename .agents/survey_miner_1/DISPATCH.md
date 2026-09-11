## 2026-09-11T12:45:51Z
You are the Specification Investigator for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_miner_1
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md

Your Task:
1. Probe authoritative sources:
   - docs/design-bff/mfe/00-arquitetura.md
   - docs/design-bff/mfe/01-operacao.md
   - docs/design-bff/mfe/02-zonas.md
   - docs/superpowers/plans/2026-09-11-multizone-refactor.md
2. Extract and document:
   - All architecture invariants (routing rules, isolation, fragment contract, status codes, navigation conventions).
   - Detailed specification of requirements R1 through R6 and exact acceptance criteria.
   - Exact endpoints, HTTP methods, headers, status codes (e.g., /remote-app/api/health -> 200, /remote-app/_fragmento/{name}/{id} -> 200/204, POST -> 405).
   - Test suites and test cases expected.
3. Write your complete findings report to /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_miner_1/handoff.md.
4. When finished, send a brief notification message to parent (ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2) referencing the report path. Do NOT modify source code or tests.
