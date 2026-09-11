# Handoff — reviewer_m2_3 (Milestone 2, Iteration 2)

**Role:** reviewer, Generation 2 triad
**Scope:** M2 = R3 + R4, `apps/host/`

---

## 1. Observation

**Test run** (`cd apps/host && node --test test/*.test.ts`):
```
✔ reactStrictMode is enabled in host next.config.js
✔ next.config.js exports rewrites as an async function
✔ rewrites returns an array containing exactly 3 rewrite rules
✔ rewrites contains the 3 required Multi-Zones routing rules
✔ rewrites dynamically respects REMOTE_ZONE_URL environment variable override
✔ rewrites dynamically respects REMOTE_APP_URL fallback environment variable
tests 6, pass 6, fail 0
```

**Type check** (`cd apps/host && pnpm exec tsc --noEmit`): exit 0, no output.

**Rewrites config** (`apps/host/next.config.js:4-27`): exactly 3 rules — `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*` — destinations from `process.env.REMOTE_ZONE_URL || process.env.REMOTE_APP_URL || 'http://localhost:3001'`. No catch-all rule; `apps/host/pages/api` does not exist, so no reserved shell route (`/`, `/api/*`) can be swallowed.

**Cross-zone navigation**: `grep -rn "next/link\|<Link" apps/host` returns zero imports — only two comments documenting the invariant (`components/SideNavigation.tsx:34`, `pages/index.tsx:108`). All navigation elements (`SideNavigation.tsx:22,36`, the zone link in `pages/index.tsx`) are plain `<a href=...>` with no `preventDefault()`.

**Shell DAL exclusion**: `grep -rn "fetch(\|axios\|prisma\|pg\b\|mysql\|mongodb\|knex" apps/host` (excluding `.next`/`node_modules`) returns nothing. `getServerSideProps` in `pages/index.tsx` only builds `hostRenderTimestamp`, `session = DEFAULT_SESSION`, `initialRoute`.

**Deletions**: `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `declarations.d.ts`, `RemoteFallbackCard.tsx`, `tsconfig.tsbuildinfo` are gone (`git show --stat 355111e -- apps/host`). A source-only grep for all deleted names and federation tokens across `apps/host/{components,pages,lib,test}`, `next.config.js`, `package.json`, `tsconfig.json`, `scripts/`, `test/` returns zero matches. An unfiltered grep hits only gitignored `apps/host/.next` and `node_modules` artifacts from a stale pre-refactor build.

**Prop consistency**: `Header.tsx` (`isRemoteAvailable?: boolean`) ← `HostLayout.tsx` (no longer forwards `isRemoteAvailable`; no longer accepts `currentTab`/`onTabSelect`) ← `pages/index.tsx` (passes only `currentSession`, `onSessionChange`). Consistent and compiles clean.

## 2. Logic Chain

The worker followed Tasks 3 and 4 of the plan: `NextFederationPlugin` replaced by the three-rule `rewrites()`, five federation-only files deleted, `index.tsx` rewritten without the lazy `remote/RemoteDashboard` import or the `fetchRemoteServerData` SSR call, and `SideNavigation`/`HostLayout`/`Header` moved to the simplified props. The rewrite test re-invokes `config.rewrites()` per test, and the destination URL is computed inside the `async rewrites()` closure at call time, not at import time. So the `REMOTE_ZONE_URL`/`REMOTE_APP_URL` override tests exercise real precedence logic and are not vacuous.

## 3. Findings

**Important — `apps/host/package.json:10` test script is not reproducible offline.** `"test": "npx tsx --test test/*.test.ts"`, but `tsx` is not a devDependency anywhere and is absent from `pnpm-lock.yaml` and every `node_modules/.bin`. `pnpm test` in a clean environment triggers an unpinned registry fetch. Fix: switch to `node --test test/*.test.ts` (native type stripping, already verified to run these tests) or pin `tsx` as a devDependency.

**Minor — dead props in `SideNavigation.tsx:6-9,11`.** `SideNavigationProps` still declares `currentTab?` and `onTabSelect?`, which the component never reads and no caller passes.

**Minor — dead prop in `Header.tsx`.** `isRemoteAvailable?: boolean` is never passed by `HostLayout.tsx`, so its branch is permanently dead.

No Critical or blocking findings inside `apps/host/`.

## 4. Regressions vs POC.md (informational, not gate-blocking for M2)

1. **"remote é uma parte interna da tela do host (host com header e sidenavigation)" is broken.** `apps/remote-app/pages/index.tsx` renders its own standalone `<header>` ("Remote Standalone Application") and never reuses the host chrome. Cross-zone navigation is a hard document navigation, so visiting `/remote-app` replaces the whole document and the shell header and sidenav disappear. Architecturally expected under Multi-Zones (`00-arquitetura.md` §7), but a real regression against the PoC goal: no zone-side re-implementation of the host chrome exists.
2. **Session inheritance is silently broken.** Before the refactor, host SSR forwarded `x-user-session` to `apps/remote-app`'s `/api/server-data` (via the deleted `safeRemoteLoader.ts`), which let `ServerCard.tsx` render an "Inherited Host Session" banner. Now `apps/remote-app/pages/index.tsx` calls `getServerData()` with no session, and `apps/host` has no cookie session (`lib/session.ts` is localStorage-only, never sent to the server). The designed mechanism ("sessão: cookie + store compartilhado", `01-operacao.md` §2) was never built. The old path is gone and nothing replaced it. Spans M1 and M2.
3. **Toast/global state and SSE.** Losing in-memory toast state on hard navigation is documented Multi-Zones behavior (§7). SSE never existed in `apps/host` even before this refactor, so it is not a regression, but it remains an unmet PoC goal.

## 5. Caveats

- `pnpm-workspace.yaml` still carries Federation-only `allowBuilds`/`onlyBuiltDependencies`/`overrides`; that file belongs to M3.
- No `next build` or servers were run (owned by challenger_m2_3); live smoke assertions were verified only statically.

## 6. Verdict

**APPROVE** — all M2 acceptance criteria for R3/R4 are met and independently verified (rewrites, `<a>`-only cross-zone navigation, shell DAL exclusion, clean deletions, 6/6 tests, clean typecheck). Findings are Important/Minor with no production-breaking consequence inside `apps/host/`.

## 7. Verification Method

```bash
cd apps/host && node --test test/*.test.ts        # tests 6, pass 6, fail 0
cd apps/host && pnpm exec tsc --noEmit             # exit 0
grep -rn "safeRemoteLoader\|FederatedErrorBoundary\|RemoteCardClientWrapper\|RemoteFallbackCard\|@module-federation\|remoteEntry\|NextFederationPlugin" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  apps/host/components apps/host/pages apps/host/lib apps/host/test \
  apps/host/next.config.js apps/host/package.json apps/host/tsconfig.json    # no matches
grep -rn "next/link\|<Link" --include="*.tsx" --include="*.ts" apps/host     # only comments
grep -n '"tsx"' pnpm-lock.yaml                                               # no match
```
