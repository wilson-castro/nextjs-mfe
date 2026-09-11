## 2026-09-11T12:45:51Z

You are the Remote Zone Codebase Explorer for the nextjs-mfe Multi-Zones refactoring task.

Working directory: /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_remote_2
Parent agent conversation ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/ORIGINAL_REQUEST.md

Your Task:
1. Investigate apps/remote and root workspace configuration:
   - apps/remote directory structure, package.json, next.config.js, tsconfig.json, existing pages/components/tests.
   - Root package.json, pnpm-workspace.yaml, and any references to apps/remote.
2. Identify all required changes for:
   - R1: Rename apps/remote -> apps/remote-app, package.json name, workspace updates.
   - R2: Configure basePath '/remote-app', assetPrefix '/remote-app-static', tsconfig exactOptionalPropertyTypes: true, next.config.js clean up of federation plugins.
   - R5: Adding /remote-app/api/health and /remote-app/_fragmento/[name]/[id] routes, contracts, and tests.
3. Check current test setup in apps/remote (vitest/jest, tsconfig, etc.).
4. Write your complete findings report to /home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_remote_2/handoff.md.
5. When finished, send a brief notification message to parent (ID: 012e9e76-2bff-4cfd-a734-2b498b65bab2) referencing the report path. Do NOT modify source code or tests.
