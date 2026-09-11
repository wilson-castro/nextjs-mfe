# Milestone 2 Forensic Audit — Host Shell Gateway (`apps/host`)

**Agent:** `auditor_m2_2` (Forensic Auditor, fresh — no prior M2 audit exists)
**Date:** 2026-09-11
**Subject:** `worker_m2/handoff.md` claims for `apps/host/` (M2 scope)
**Repo:** `/home/wilson-castro/Documents/projects/mira/nextjs-mfe`, branch `bff-multizone`, HEAD `355111e`

---

## 1. Observation

### 1.1 Environment facts
- `which rtk` → exit 1 (not found). `which tsx` → exit 1 (not found). No `tsx` binary anywhere under `node_modules/.bin` in the repo.
- Node `v24.7.0` — supports native TS stripping, so `node --test test/*.test.ts` runs the `.test.ts` files directly without `tsx`.
- `apps/host/package.json`'s own `"test"` script (`"npx tsx --test test/*.test.ts"`) would not run in this sandbox (no `tsx`, and running `npx` is disallowed by my dispatch). I never executed it; I used `node --test test/*.test.ts` directly per instructions.

### 1.2 Claim vs. reality (`git show --stat 355111e -- apps/host`)

| Claim in `worker_m2/handoff.md` | Verified against tree / diff | Result |
|---|---|---|
| Deleted `lib/safeRemoteLoader.ts` | Absent from tree; `-99` lines in diff | CONFIRMED |
| Deleted `components/FederatedErrorBoundary.tsx` | Absent; `-62` lines | CONFIRMED |
| Deleted `components/RemoteCardClientWrapper.tsx` | Absent; `-46` lines | CONFIRMED |
| Deleted `declarations.d.ts` | Absent; `-105` lines | CONFIRMED |
| Deleted `components/RemoteFallbackCard.tsx` | Absent; `-44` lines | CONFIRMED |
| Deleted `tsconfig.tsbuildinfo` | Diff shows `apps/host/tsconfig.tsbuildinfo | 1 -` (removed from commit) | CONFIRMED (a `tsconfig.tsbuildinfo` exists again in the live tree, dated after the commit and `git status` shows it **untracked** — a byproduct of a later `tsc` run by another agent, not part of commit `355111e`, not committed) |
| `package.json`: `@module-federation/nextjs-mf` removed, `dev`/`build` scripts de-federated, `"test"` script added | Read `apps/host/package.json` — confirmed; no federation dependency present | CONFIRMED |
| `next.config.js`: 3 rewrite rules, `reactStrictMode: true`, env-var precedence `REMOTE_ZONE_URL \|\| REMOTE_APP_URL \|\| localhost:3001` | Read file — matches exactly | CONFIRMED |
| `Header.tsx`: `isRemoteAvailable` optional | Read file — `readonly isRemoteAvailable?: boolean` | CONFIRMED |
| `HostLayout.tsx`: props reduced to `children/currentSession/onSessionChange` | Read file — matches | CONFIRMED |
| `SideNavigation.tsx`: plain `<a>` links, `.nav-link` class, updated badge | Read file — matches | CONFIRMED |
| `pages/index.tsx`: shell diagnostics only, `<a href="/remote-app">`, zero domain fetch in `getServerSideProps` | Read file — matches; `getServerSideProps` only builds timestamp/session/route | CONFIRMED |
| `test/rewrites.test.ts`: 6 tests | Read file — exactly 6 `test(...)` blocks | CONFIRMED |
| "6/6 tests pass" (via `rtk npx tsx --test`) | Ran independently: `cd apps/host && node --test test/*.test.ts` → **6 pass, 0 fail** | CONFIRMED (reproduced with a different runner since `rtk`/`tsx` are unavailable here) |
| `tsc --noEmit` zero errors | Ran independently: `cd apps/host && pnpm exec tsc --noEmit` → exit 0, no output | CONFIRMED |
| `pnpm run build` succeeds | **Not run** — my dispatch forbids `next build`/starting servers; another agent owns that. Unverified, not contradicted. | UNVERIFIED (by design) |
| Ripgrep zero federation matches in `apps/host/` | Ran `grep -rnE '@module-federation\|remoteEntry\|NextFederationPlugin\|remote/ServerCard\|remote/RemoteDashboard\|exposes:\|remotes:' apps/` (excluding `node_modules`, `.next`) → 0 matches anywhere in `apps/` | CONFIRMED |
| Handoff's own claimed commands used a `rtk` wrapper (`rtk npx tsx --test`, `rtk tsc --noEmit`, `rtk proxy pnpm run build`) | `rtk` does not exist in this sandbox. However, the exact same `rtk`-prefixed command pattern appears independently in `worker_m1_fix/handoff.md`, `reviewer_m1_3/handoff.md`, and their `DISPATCH.md` files — i.e. it is a harness-wide tool used consistently across the whole `.agents/` trace, referencing the original box (`/home/gabrigas/Selene/Adventure/nextjs-mfe`), not something `worker_m2` invented ad hoc. | CAVEAT, not a fabrication finding — see §4 |

### 1.3 Nothing undisclosed found in the M2-owned diff
Every file touched under `apps/host/` in commit `355111e` is accounted for in the handoff and matches its ownership list (`next.config.js`, `package.json`, `pages/index.tsx`, `Header.tsx`, `HostLayout.tsx`, `SideNavigation.tsx`, `test/rewrites.test.ts`, plus the 6 deletions). No scope creep, no unexplained files. The commit also contains a large M1 diff (`apps/{remote => remote-app}/...`, including a newly-added `apps/remote-app/tsconfig.tsbuildinfo` build artifact) but that is M1's ownership, not M2's, and out of scope for this audit.

### 1.4 Banned-token / test-integrity-smell grep

```
grep -rnE '@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard|exposes:|remotes:' apps/ (excl. node_modules, .next)
→ 0 matches

grep -rnE '\.skip\(|\.only\(|todo|\|\| true|process\.exit\(0\)' apps/host/test scripts/smoke-test.mjs test/e2e/
→ 1 match: scripts/smoke-test.mjs:60  process.exit(0);
```
Inspected that one hit: it's inside `printHelpAndExit()`, triggered only by `--help`/`-h`, unrelated to test pass/fail logic. Not a smell.

No `.skip`/`.only`/`todo`/`|| true` anywhere in `apps/host/test/rewrites.test.ts` or the E2E scripts. No catch-and-continue that silently turns a failure into a pass was found in `rewrites.test.ts`.

### 1.5 Falsification mutation table (core check)

Setup: `apps/host` copied to scratch (`.../scratchpad/auditor_m2_2/host-copy/`) excluding `node_modules`/`.next`, with `node_modules` symlinked back to the real `apps/host/node_modules`. Baseline run in the copy reproduced the same 6/6 pass. Each mutation below was applied to `next.config.js` only, one at a time, then `node --test test/*.test.ts` was run from the copy and reverted before the next mutation.

| Mutation | Description | Tests failing | Survived (no failure)? |
|---|---|---|---|
| (a) | Delete the root `/remote-app` rule | `rewrites returns an array containing exactly 3 rewrite rules`, `rewrites contains the 3 required Multi-Zones routing rules`, `rewrites dynamically respects REMOTE_ZONE_URL...`, `rewrites dynamically respects REMOTE_APP_URL...` (4 of 6 fail) | No |
| (b) | Swap the sub-route and static-asset destinations | `rewrites contains the 3 required Multi-Zones routing rules`, `...REMOTE_ZONE_URL...`, `...REMOTE_APP_URL...` (3 of 6 fail) | No |
| (c) | Hardcode `remoteZoneUrl = 'http://localhost:3001'`, ignore both env vars | `rewrites dynamically respects REMOTE_ZONE_URL environment variable override`, `...REMOTE_APP_URL fallback...` (2 of 6 fail) | No |
| (d) | Keep `REMOTE_ZONE_URL`, drop the `REMOTE_APP_URL` fallback | `rewrites dynamically respects REMOTE_APP_URL fallback environment variable` (1 of 6 fail) | No |
| (e) | Add a 4th rule `{ source: '/:path*', destination: '${remoteZoneUrl}/:path*' }` | `rewrites returns an array containing exactly 3 rewrite rules` (1 of 6 fail) | No |

**Result: every one of the 5 required mutations produced at least one failing test.** `test/rewrites.test.ts` is a genuine, non-tautological test of the rewrite contract — no untested property found here.

### 1.6 Static suite vacuity check (STATIC-03, STATIC-06 in `test/e2e/static-invariants.mjs`)

Both are string/regex checks over raw file text via `assertContains`/`assertNotRegex` (`test/e2e/test-helpers.mjs`), not an actual invocation of `rewrites()` or a DOM/JSX parse.

**STATIC-03** (`testPlainHtmlNavigation`, lines 104–115): checks `apps/host/pages/index.tsx` and `apps/host/components/SideNavigation.tsx` each (a) contain the literal substring `href="/remote-app"` and (b) do **not** match `/<Link[^>]*href=["']\/remote-app/i`.
- Verified by direct execution (Node, not the real script's file I/O — inline reproduction of the same two assertions) against a synthetic `<Link href="/remote-app">Zone</Link>` snippet substituted for `SideNavigation.tsx`'s current `<a>` link: the `assertNotRegex` step throws immediately. **STATIC-03 would catch this substitution.**
- Caveat: it only inspects these two known files by path. A `<Link href="/remote-app">` added in a *different, unlisted* host file (e.g. `Header.tsx`) would not be scanned at all. Also, a braced form `<Link href={"/remote-app"}>` **coexisting alongside** an already-passing literal `<a href="/remote-app">` elsewhere in the same file would defeat the regex (it only matches `href=["']...`, not `href={...}`) while `assertContains` would still pass off the unrelated `<a>` tag. Neither edge case is present in the real `apps/host` code today, so this is a latent gap in the check, not an exploited one.

**STATIC-06** (`testHostRewritesConfig`, lines 158–167): checks `apps/host/next.config.js` raw text (a) contains the substring `rewrites`, and (b) contains the three literal substrings `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*`.
- **Proven vacuous for the missing-root-rule case.** I reproduced `testHostRewritesConfig`'s exact logic (plain `.includes()`) against mutation (a)'s content (root rule deleted, sub-route and static rules intact) and it reported **PASS** — because the substring `/remote-app` is trivially present inside `/remote-app/:path*` and `/remote-app-static/:path*`, which remain in the file. STATIC-06 does not actually verify 3 distinct rules exist or that the root rule specifically is present; it only checks that 3 known substrings appear somewhere in the file text.
- This means: **STATIC-06 would NOT catch a missing root `/remote-app` rule** — the exact regression mutation (a) is designed to probe. Only `rewrites.test.ts` (owned by M2, exercised above) actually catches it.

---

## 2. Logic Chain

1. Every file the handoff says it deleted is confirmed absent from the live tree and matches the `git show --stat` diff exactly (5 deletions + the `tsbuildinfo` removed-from-commit).
2. Every file the handoff says it edited was read directly and its content matches the described change (rewrites, prop simplification, `<a>`-only navigation, zero-DAL `getServerSideProps`).
3. My own independent run of `node --test test/*.test.ts` reproduces "6 pass, 0 fail" and my own `tsc --noEmit` reproduces "0 errors" — both claims hold up under a different test runner (native Node, not `tsx`) in an environment where `tsx`/`rtk` are absent.
4. The falsification pass is the load-bearing check: all 5 required mutations to the rewrite contract (missing root rule, swapped destinations, hardcoded URL, dropped `REMOTE_APP_URL` fallback, extraneous catch-all rule) each broke at least one of the 6 tests in `rewrites.test.ts`. None survived. The suite genuinely encodes the M2 rewrite contract; it is not decorative.
5. The one demonstrated weakness (STATIC-06's vacuity on the missing-root-rule case) sits in `test/e2e/static-invariants.mjs`, which is owned by the E2E track, not by `worker_m2`. `worker_m2`'s own handoff cites the STATIC-06 PASS as corroborating evidence, but the actual regression-catching work for the root-rule invariant is done by `rewrites.test.ts`, which I independently verified does catch it. So the vacuity does not let a real defect slip past M2's own test — it just means one of the handoff's cited "extra" green checkmarks is weaker evidence than it appears.
6. The `rtk`/`tsx`/`pnpm run build` commands the handoff quotes cannot be reproduced verbatim in this sandbox, but the identical wrapper pattern appears independently across the whole `.agents/` trace (M1 worker-fix and M1 reviewer), pointing to an environment difference between the original execution box and this audit sandbox rather than an invention specific to `worker_m2`. Combined with the fact that I independently reproduced the *substance* of every numerically-checkable claim (6/6 tests, 0 tsc errors, 0 grep matches) via different tooling, I do not treat the `rtk`-wrapped transcript as fabricated.

---

## 3. Findings

| # | Severity | File:Line | Evidence | Fix |
|---|---|---|---|---|
| 1 | Low | `test/e2e/static-invariants.mjs:158-167` (`testHostRewritesConfig`) | Plain substring check on `next.config.js`; `/remote-app` is a substring of `/remote-app/:path*` and `/remote-app-static/:path*`, so deleting the root rule still passes STATIC-06 (demonstrated in §1.6). Not M2-owned code and not cited by the worker as something *it* wrote or tested, but the handoff's verification table presents the STATIC-06 PASS as supporting evidence without noting this weakness. | Have the E2E owner change `testHostRewritesConfig` to parse `rewrites()`'s actual return value (as `rewrites.test.ts` already does) or match rule boundaries (e.g. `source: '/remote-app'` with a following comma/brace) instead of a bare substring. |
| 2 | Info | `test/e2e/static-invariants.mjs:104-115` (`testPlainHtmlNavigation`) | Regex `/<Link[^>]*href=["']\/remote-app/i` only matches the literal-quoted JSX attribute form and only scans two named files; a braced `href={...}` form or a `<Link>` in an unlisted file would not be caught (latent, not exploited — current code contains no `<Link>` at all). | Widen the file scan or accept as a known limitation; not a blocking issue for M2. |
| 3 | Info | Working tree (untracked) | `apps/host/tsconfig.tsbuildinfo` exists in the live tree, postdating and not part of commit `355111e` (the commit actually *removes* this file, and `git status` confirms it's currently untracked). Byproduct of a later `tsc` invocation by another agent (possibly the M2/M1 verification chain), not of `worker_m2`'s own work. | No action needed on M2; flag so it isn't accidentally `git add`ed later. |

No integrity violations found in `worker_m2`'s own scope. No banned tokens, no test-integrity smells (`.skip`/`.only`/`todo`/`|| true`/swallowed failures), no tautological assertions, and — critically — no mutation of the rewrite contract survived `rewrites.test.ts`.

---

## 4. Caveats

- `pnpm run build` (production build) was **not executed** per my dispatch's hard rule against running `next build`/starting servers. The handoff's build-success claim is therefore unverified by me, not contradicted.
- The handoff's transcripts show commands prefixed with `rtk` (a wrapper/tool not present in this audit sandbox) and `npx tsx`, both of which I could not run verbatim (`rtk` doesn't exist here; `tsx` isn't installed and running `npx` is disallowed by my dispatch). I substituted `node --test test/*.test.ts` (native Node 24 TS stripping) and `pnpm exec tsc --noEmit`, both of which independently reproduced the claimed results. I cannot forensically confirm the *exact* transcript in the handoff was captured verbatim from a live `rtk` run vs. reconstructed, but the substance of every checkable claim held up under independent re-execution with different tooling, and the same `rtk` pattern appears across multiple independent agents in this `.agents/` trace (not unique to `worker_m2`), consistent with a real environment difference rather than fabrication.
- I did not audit Milestone 1 (`apps/remote-app`) content beyond confirming its diff exists and is unrelated to M2's ownership; that milestone had its own auditor track (`auditor_m1_1`, `auditor_m1_2`).
- Did not start dev servers or run the E2E online smoke suite (`--online`), per hard rules; cannot independently verify the acceptance criteria's live HTTP behaviors (those belong to M1/M3/E2E, not M2's static-scope claims).

---

## 5. Verdict

**CLEAN** — every factual claim in `worker_m2/handoff.md` about `apps/host/` checks out against the tree and independent re-execution, and `rewrites.test.ts` survived falsification on all 5 required mutations with no tautologies or test-integrity smells; the one real weakness found (STATIC-06 vacuity) lives in E2E-owned code the worker didn't write and doesn't invalidate M2's own passing test.

---

## 6. Verification Method

Commands run directly against the real tree (read-only) and against a scratch copy of `apps/host` (mutations only in the copy):

```bash
# Environment facts
which rtk; which tsx; node --version

# Diff / claim verification
git show --stat 355111e -- apps/host apps/remote-app apps/remote
git status --porcelain apps/host/tsconfig.tsbuildinfo

# Files read directly (Read tool, not shown here):
apps/host/package.json
apps/host/next.config.js
apps/host/pages/index.tsx
apps/host/components/{Header,HostLayout,SideNavigation}.tsx
apps/host/test/rewrites.test.ts
test/e2e/static-invariants.mjs
test/e2e/test-helpers.mjs
scripts/smoke-test.mjs

# Banned-token / smell greps
grep -rnE '@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard|exposes:|remotes:' apps/
grep -rnE '\.skip\(|\.only\(|todo|\|\| true|process\.exit\(0\)' apps/host/test scripts/smoke-test.mjs test/e2e/

# Independent test + typecheck execution (real tree)
cd apps/host && node --test test/*.test.ts     # 6 pass, 0 fail
cd apps/host && pnpm exec tsc --noEmit         # exit 0, no output

# Falsification (scratch copy only)
rsync -a --exclude node_modules --exclude .next apps/host/ <scratch>/host-copy/
ln -s <repo>/apps/host/node_modules <scratch>/host-copy/node_modules
# For each of 5 mutated next.config.js variants (a-e): copy over, `node --test test/*.test.ts`, record pass/fail, restore original.

# STATIC-06 vacuity proof (inline reproduction of testHostRewritesConfig's exact .includes() logic
# against the mutation-(a) config content, confirming it reports PASS despite the missing root rule)

# STATIC-03 catch proof (inline reproduction of testPlainHtmlNavigation's exact assertions
# against a synthetic <Link href="/remote-app"> snippet, confirming it reports FAIL)
```

No real-tree files were modified. All mutations occurred only under
`/tmp/claude-1000/-home-wilson-castro-Documents-projects-mira-nextjs-mfe/71a7ead9-8f42-48f0-94b0-aa1d8b996dc6/scratchpad/auditor_m2_2/host-copy/`.
