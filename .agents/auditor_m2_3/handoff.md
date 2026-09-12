# Milestone 2 Remediation Audit — F1 (auditor_m2_3)

**Scope:** Independently verify `worker_m2_fix`'s claims for the F1 remediation
(`apps/host/middleware.ts` + `lib/zoneLiveness.ts` + `lib/zoneErrorPage.ts` +
`lib/zoneErrorContent.ts` + `pages/erro-de-zona.tsx` + 4 new test files, plus the
dead-props cleanup in `Header.tsx`/`SideNavigation.tsx`). F2 (SSE leak) is
human-deferred per `.agents/orchestrator/DEFERRED.md` D1 — not evaluated as an
integrity issue.

All mutation/deletion work below was performed exclusively in a scratch copy at
`/tmp/claude-1000/.../scratchpad/auditor_m2_3/host` (symlinked `node_modules`,
excluded `.next`). The real working tree was never mutated — confirmed at the
end with `diff -r` (scratch vs. real, excluding `node_modules`/`.next`/
`tsconfig.tsbuildinfo`) returning no differences, and a final `git status --short`
identical to the pre-audit snapshot.

---

## 1. Observation (raw outputs)

### 1.1 TDD claim — tests fail without the implementation

Baseline in the scratch copy first, unmodified: `node --test test/*.test.ts` →
`tests 27 / pass 27 / fail 0`.

Then deleted `middleware.ts`, `lib/zoneLiveness.ts`, `lib/zoneErrorPage.ts`,
`lib/zoneErrorContent.ts`, `pages/erro-de-zona.tsx`, keeping every test file,
and re-ran:

```
✖ pages/erro-de-zona.tsx exists
✖ pages/erro-de-zona.tsx has no server-side data fetching (...)
✖ pages/erro-de-zona.tsx never calls fetch() or reaches for the remote zone URL
✖ pages/erro-de-zona.tsx exports a default React component
✖ pages/erro-de-zona.tsx renders the shared shell error copy
✖ middleware.ts exists at the host app root
✖ middleware.ts matcher covers the zone root, zone sub-routes, and zone static assets
✖ middleware.ts responds 503 with Retry-After when the zone is unhealthy, not a bare 500
✖ middleware.ts consults the shared zone liveness cache rather than probing on every request inline
✔ reactStrictMode is enabled in host next.config.js
✔ next.config.js exports rewrites as an async function
✔ rewrites returns an array containing exactly 3 rewrite rules
✔ rewrites contains the 3 required Multi-Zones routing rules
✔ rewrites dynamically respects REMOTE_ZONE_URL environment variable override
✔ rewrites dynamically respects REMOTE_APP_URL fallback environment variable
✖ test/zone-error-page.test.ts   (whole-file ERR_MODULE_NOT_FOUND)
✖ test/zone-liveness.test.ts     (whole-file ERR_MODULE_NOT_FOUND)

ℹ tests 17
ℹ pass 6
ℹ fail 11
```

**Verdict on this check: TDD claim holds.** Every one of the 21 new assertions
(across the 4 new files; some collapse into 2 whole-file import failures) fails
with the implementation removed, and only the 6 pre-existing `rewrites.test.ts`
tests (untouched, unrelated to F1) pass. Restoring the 5 files reproduces
`tests 27 / pass 27 / fail 0` exactly as claimed. Test-file count also checked
independently: `grep -c '^test('` across the 5 files sums to 8+4+5+4+6 = 27,
matching the handoff's number exactly.

### 1.2 Falsification by mutation (scratch copy only, one at a time, restored between each)

| # | Mutation | Result | Caught? | Handoff disclosed this gap? |
|---|---|---|---|---|
| 1 | Remove `/remote-app-static/:path*` from `middleware.ts`'s `matcher` | `tests 27 / pass 26 / fail 1` — `middleware-config.test.ts`'s matcher-coverage test fails | **YES** | N/A (test works as intended) |
| 2 | Invert the liveness verdict: `if (isZoneHealthy)` → `if (!isZoneHealthy)` (zone down is now treated as healthy, defeating the entire fix) | `tests 27 / pass 27 / fail 0` — **no test fails** | **NO — survivor** | Only generically ("middleware.ts... is exercised only by the live-proof run... a real gap in unit coverage of the wiring"). The specific fact that inverting the core decision produces zero red tests was not called out. |
| 3 | `DEFAULT_TTL_MS = 3000` → `Number.MAX_SAFE_INTEGER` in `lib/zoneLiveness.ts` (the constant actually wired into `getSharedZoneLivenessCache()`, i.e. what `middleware.ts` uses in production) | `tests 27 / pass 27 / fail 0` — **no test fails** | **NO — survivor** | Not disclosed at all. The unit tests only exercise `createZoneLivenessCache` with an *injected* `ttlMs`; `getSharedZoneLivenessCache()`/`DEFAULT_TTL_MS` has zero test coverage, and this was not flagged as a caveat. |
| 4 | Make the outage response a bare `500` with **no headers at all** (`new NextResponse('Internal Server Error', { status: 500 })`) — i.e. reintroduce the exact original F1 defect | `tests 27 / pass 27 / fail 0` — **no test fails** | **NO — survivor** | Not disclosed. This is the single most important survivor: `middleware-config.test.ts`'s test named "middleware.ts responds 503 with Retry-After when the zone is unhealthy, not a bare 500" only does `assert.match(source, /503/)` and `assert.match(source, /retry-after/i)` against the **entire file's raw text, including its doc comment**. The comment block (`"Status code: 503 Service Unavailable with \`Retry-After\`, not the bare 500 this fix replaces..."`) still contains both literal strings even after the functional code is reverted to a bare 500, so the regex matches the prose and the test passes regardless of what the handler actually returns. Verified directly: `grep -n -i "503\|retry-after" middleware.ts` after the mutation still shows two matches, both inside the comment. |
| 5 | Copy drift: hardcode a different heading string directly in `pages/erro-de-zona.tsx`'s JSX instead of using `{ZONE_ERROR_HEADING}` | `tests 27 / pass 27 / fail 0` — **no test fails** | **NO — survivor** | Not disclosed. `erro-de-zona-page.test.ts`'s last test does `assert.match(source, /ZONE_ERROR_HEADING|ZONE_ERROR_MESSAGE/)` against the whole file. The import statement at the top of the file still contains the literal identifier `ZONE_ERROR_HEADING` even when it is no longer used anywhere in the rendered JSX, so the test cannot actually detect that the page stopped using the shared copy. Verified: `grep -n ZONE_ERROR_HEADING pages/erro-de-zona.tsx` still matches the (now-unused) import line after the mutation. |

4 of 5 requested mutations survive with **zero** test failures. All 5 were
individually restored and re-verified back to `tests 27 / pass 27 / fail 0`
before moving to the next, and the final scratch tree matches the real tree
byte-for-byte (`diff -r`, exit 0).

### 1.3 Claim vs. reality

- **Test counts** (27/27, 6 pre-existing + 21 new): confirmed independently, §1.1.
- **`tsc --noEmit` clean**: reproduced in the **real** tree (read-only, no scratch needed): `cd apps/host && pnpm exec tsc --noEmit` → exit 0, no output. Matches the claim.
- **`git diff` for dependency/workspace files**: `git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc apps/host/package.json` → empty. "No new dependencies" holds.
- **`apps/host/tsconfig.json` modified**: confirmed via `git diff`, exactly one line added — `"allowImportingTsExtensions": true` — nothing else changed. This *was* disclosed (§1.3 and Caveats of the worker's handoff), with a stated reason (an explicit `.ts` import inside `lib/zoneErrorPage.ts` needed by `node --test`'s ESM resolution). Traced through the actual source: `lib/zoneErrorPage.ts` imports `./zoneErrorContent.ts` with the explicit extension while `middleware.ts` and `pages/erro-de-zona.tsx` import the same module extensionlessly — consistent with the stated reason (only the file whose test imports it directly via Node's ESM loader needs the workaround; `middleware.ts` is never imported by `node --test`, so it doesn't). The change is minimal (one flag, one line) and its scope is accurately described. Accepted as necessary and disclosed.
- **"Only `apps/host/**` touched"**: `git status --short` shows exactly the files the worker listed under `apps/host/`, plus three `.agents/orchestrator/*.md` diffs that both the worker's and the challenger's handoffs independently attribute to a concurrent process, not themselves. No file outside `apps/host/` and `.agents/` was touched. Holds.
- **Dead-props cleanup ("zero callers")**: re-ran the worker's own grep independently across the whole repo — `grep -rn "currentTab\|onTabSelect\|isRemoteAvailable" apps/ --include="*.tsx" --include="*.ts"` → no matches anywhere, confirming the props were genuinely dead before removal. Diffs of `Header.tsx`/`SideNavigation.tsx` match exactly what the handoff describes (prop removal + collapsing the status-pill branch).
- **Build output, live-proof (503/Retry-After/recovery), ports freed**: **not independently reproduced** — this round's hard rules forbid `next build` and starting servers (`challenger_m2_4` owns that this round). Taken on faith from the handoff text; internally consistent with the challenger's original repro (same host/zone ports, same curl shape) but not verified by this audit. Flagged as a caveat, not a finding, since it is explicitly out of this role's scope this round.

### 1.4 Banned tokens / test smells

`grep -rnE "\.skip\(|\.only\(|TODO|todo\(|\|\| true|catch\s*\{\s*\}|catch\s*\(.*\)\s*\{\s*\}"` across all 5 new source files and 4 new test files: **no matches**. No authorship-attribution text found either (`generated by|co-authored|claude|anthropic|gpt|assistant|written[- ]by|@author`, all case-insensitive): **no matches**. No `.skip`/`.only`, no silent catch-and-pass, no hardcoded-constant-mirroring-implementation smell of the classic kind.

However, §1.2 above surfaces a **different, more consequential** test smell not on the literal banned list: three tests (`middleware-config.test.ts`'s 503/Retry-After test, and implicitly its matcher/liveness-delegation tests to a lesser degree, plus `erro-de-zona-page.test.ts`'s shared-copy test) are **regexes against raw file text that also match the file's own comments and imports**, so they can pass even when the behavior they name has been reverted or removed. This is functionally equivalent to "an assertion that can never fail" for the specific regression it claims to guard — the assertion *can* fail (mutation 1 proved the matcher test is real), but the 503/Retry-After and shared-copy assertions cannot, because their target strings are unconditionally present elsewhere in the same file.

### 1.5 `tsc --noEmit` (real tree, read-only)

```
$ cd apps/host && pnpm exec tsc --noEmit
(no output, exit 0)
```
Confirmed clean, matching the claim.

---

## 2. Logic Chain

1. The worker's TDD narrative (tests written first, red against the pre-fix
   tree, green after) is independently reproducible and true — verified by
   literally deleting the 5 implementation files and re-running the suite.
   This part of the central claim stands.
2. The green suite (27/27) is real and does exercise genuine logic for the
   *pure* modules: `lib/zoneLiveness.ts`'s TTL/caching/de-dup/probe-timeout
   behavior is thoroughly and correctly unit-tested (mutation 1 — a matcher
   omission — was caught cleanly, proving the harness isn't universally inert).
3. But the one thing `middleware.ts` actually *does* at runtime — decide,
   based on the liveness verdict, whether to return `NextResponse.next()` or
   a `503` with specific headers — is not exercised by any test that can
   fail if that decision is wrong. The handoff's own caveat ("middleware.ts
   itself is not, and cannot be, imported by any `node --test` file... a real
   gap in unit coverage of the wiring") correctly names the *mechanism* of the
   gap but understates its *consequence*: it frames this as a coverage gap
   in an otherwise-covered feature, when mutation testing shows the automated
   suite provides **zero** protection against regressing to the literal
   pre-fix defect (a bare 500), against inverting the health check entirely,
   or against an effectively-infinite TTL that never re-probes — the three
   most safety-critical properties of the whole remediation.
4. This is worse than an honestly-flagged gap because the test names
   themselves assert the opposite: `middleware-config.test.ts` contains a
   test literally named "middleware.ts responds 503 with Retry-After when the
   zone is unhealthy, not a bare 500" that a future reader (or CI dashboard)
   will reasonably interpret as behavioral proof. It is not — it is a
   grep over source text, including the doc comment that happens to
   contain the same words the implementation is supposed to produce. Anyone
   who reverts the fix by editing only the `return new NextResponse(...)`
   call (leaving the comment above it untouched, the natural way to make a
   quick "just ship it" change under time pressure) gets a fully green CI
   run.
5. The same shape of problem hits the cross-file copy-sync guarantee
   (`erro-de-zona-page.test.ts`'s last test): it is supposed to prevent the
   page and the middleware fallback from drifting apart, but it is satisfied
   by an unused import statement, so the one property it exists to protect
   (rendered text staying in sync) is exactly what it fails to verify.
6. None of this means F1 is unfixed today — the live-proof transcript (not
   independently reproduced by this audit, but internally consistent and not
   contradicted by anything found) shows the mechanism working as designed
   right now. The integrity concern is that the remediation's own
   regression-proofing — the thing a gate is supposed to rely on so it
   doesn't have to re-run a manual live repro every time — is illusory for
   the properties that matter most, and the handoff's framing (test counts,
   a single generic caveat) does not give the gate enough information to
   see that.

---

## 3. Findings

**Critical — INTEGRITY**

- **F-A**: `middleware-config.test.ts`'s 503/Retry-After test is satisfied by
  the file's doc comment, not its behavior. Reverting the actual response to
  a bare 500 with no headers (the literal original F1 defect) produces a
  fully green `27/27` test run. Not disclosed in the handoff beyond a
  generic "unit coverage gap" caveat that does not name this specific
  failure mode.
- **F-B**: The liveness decision itself (`if (isZoneHealthy) ... else 503`)
  is untested; inverting it (treating a dead zone as healthy, i.e.
  completely defeating the fix) produces a fully green run. Not disclosed.
- **F-C**: `DEFAULT_TTL_MS`, the constant actually used by production code
  (`getSharedZoneLivenessCache()`), is untested — only the injectable
  `ttlMs` parameter is. Setting it to effectively-infinite (never re-probe,
  the exact "reject: probe once at boot, cache forever" option the
  handoff's own Logic Chain says was rejected) produces a fully green run.
  Not disclosed.
- **F-D**: `erro-de-zona-page.test.ts`'s "shared copy" test is satisfied by
  an unused import; hardcoding divergent copy directly in the JSX produces a
  fully green run. Not disclosed.

**Note (not a finding against the worker):** F2 (SSE leak) remains correctly
untouched and is properly recorded in `.agents/orchestrator/DEFERRED.md` D1 as
a human-deferred, pre-existing M1-owned defect — this is not an integrity
issue, per the task brief.

---

## 4. Caveats

- Build output, the live 503/Retry-After/recovery proof, and "ports freed"
  were **not** independently reproduced by this audit — `next build` and
  starting servers are out of scope for this role this round
  (`challenger_m2_4` owns that). Taken on faith; nothing found contradicts
  them, but they are unverified by this report.
- The four survivor mutations are individually plausible, deliberate
  regressions chosen to match the task's suggested list; they are not an
  exhaustive fuzz of every possible mutation, only proof that these specific,
  behaviorally-significant properties are unprotected.
- `middleware.ts` cannot be imported under plain `node --test` at all (no
  `exports` map for `next/server`'s bare specifier) — this is a genuine,
  documented constraint of the environment, not a shortcut the worker chose;
  the criticism here is not "why didn't you unit-test middleware.ts" but
  "the compensating static-text tests give false assurance and that
  wasn't flagged with enough specificity for the gate to weigh it."
- All mutation and deletion work was confined to the scratch copy at
  `/tmp/claude-1000/.../scratchpad/auditor_m2_3/host`; the real tree was
  verified byte-identical to the pre-audit `git status` snapshot at the end.

---

## 5. Verdict

**INTEGRITY VIOLATION**

Not because F1 is unfixed — the live mechanism, as far as this audit can
tell without reproducing it, appears to work. The violation is that the
central claim under audit — "these tests were written first, failed, and now
pass, and that's how we know F1 is fixed and will stay fixed" — overstates
what the green suite actually protects. Three of the suite's tests are
satisfiable by source text that is unconditionally present regardless of
runtime behavior (a doc comment, an unused import), and a fourth
safety-critical property (the production TTL constant) has no test at all.
Mutating any of these four properties back to exactly the kind of regression
F1 exists to prevent — including the literal original defect, a bare 500 —
produces a fully green `27/27` run. This was not disclosed with the
specificity the gate needs; the one caveat that comes close ("a real gap in
unit coverage of the wiring") reads as a minor, generic limitation rather
than "the test suite cannot detect the fix being silently reverted."

---

## 6. Verification Method

```bash
# Scratch copy setup (real tree never touched)
rsync -a --exclude node_modules --exclude .next apps/host/ "$SCRATCH/host/"
ln -s <repo>/apps/host/node_modules "$SCRATCH/host/node_modules"

# 1. TDD claim: baseline green, then implementation removed
cd "$SCRATCH/host" && node --test test/*.test.ts        # 27/27
rm middleware.ts lib/zoneLiveness.ts lib/zoneErrorPage.ts lib/zoneErrorContent.ts pages/erro-de-zona.tsx
node --test test/*.test.ts                                # 17 tests, 6 pass, 11 fail — every new test fails
# restore all 5 files from backup, confirm 27/27 again

# 2. Mutation testing (each restored before the next; final diff -r vs. real tree = clean)
sed -i "s#'/remote-app-static/:path\*'##" middleware.ts && node --test test/*.test.ts   # 26/27 — caught
sed -i 's/if (isZoneHealthy) {/if (!isZoneHealthy) {/' middleware.ts && node --test test/*.test.ts  # 27/27 — survivor
sed -i 's/DEFAULT_TTL_MS = 3000/DEFAULT_TTL_MS = Number.MAX_SAFE_INTEGER/' lib/zoneLiveness.ts && node --test test/*.test.ts  # 27/27 — survivor
# replace the 503+headers NextResponse with `new NextResponse('Internal Server Error', { status: 500 })`
node --test test/*.test.ts   # 27/27 — survivor; grep -i "503\|retry-after" middleware.ts still matches the doc comment
# hardcode a divergent heading string in pages/erro-de-zona.tsx instead of {ZONE_ERROR_HEADING}
node --test test/*.test.ts   # 27/27 — survivor; grep ZONE_ERROR_HEADING pages/erro-de-zona.tsx still matches the unused import

# 3. Claim vs. reality (real tree, read-only)
git diff --stat
git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc apps/host/package.json   # empty
git diff -- apps/host/tsconfig.json    # exactly +1 line, allowImportingTsExtensions
git status --short                     # matches handoff's file list
grep -rn "currentTab\|onTabSelect\|isRemoteAvailable" apps/ --include="*.tsx" --include="*.ts"  # no matches

# 4. Banned tokens / authorship
grep -rnE "\.skip\(|\.only\(|TODO|todo\(|\|\| true|catch\s*\{\s*\}" <new files>   # no matches
grep -rniE "generated by|co-authored|claude|anthropic|gpt|assistant|written[- ]by|@author" <new files>  # no matches

# 5. tsc (real tree, read-only)
cd apps/host && pnpm exec tsc --noEmit   # exit 0, no output
```
