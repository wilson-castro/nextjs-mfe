# Handoff — reviewer_m2_4 (Milestone 2, Iteration 3 — F1 remediation)

**Role:** reviewer, Generation 2 triad
**Scope:** the F1 remediation in `apps/host/`

---

## 1. Observation

**Tests** (`cd apps/host && node --test test/*.test.ts`), independently re-run: `tests 27, pass 27, fail 0` — matches the worker's claimed count.

**Type check** (`pnpm exec tsc --noEmit`): exit 0.

**Scope of changes** (`git status --short`, `git diff`):
- New: `middleware.ts`, `lib/zoneLiveness.ts`, `lib/zoneErrorPage.ts`, `lib/zoneErrorContent.ts`, `pages/erro-de-zona.tsx`, 4 test files.
- Modified: `Header.tsx`, `SideNavigation.tsx` (dead props), `tsconfig.json` (+1 line: `allowImportingTsExtensions: true`).
- `apps/host/package.json` and `pnpm-lock.yaml`: no diff — no new dependency.
- `git diff -- apps/remote-app`: empty — `sse-events.ts` (F2, deferred as D1) untouched.
- `rg "currentTab|onTabSelect|isRemoteAvailable" apps/host`: zero hits — dead-prop removal is safe.

**Matcher parity**: `middleware.ts:53` and `next.config.js:10-24` both list exactly `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*`.

**Mechanism trace**:
- Cold cache: `cached` is `null` → `isHealthy()` awaits a real probe before answering. No false-healthy default.
- Probe hang: `createFetchProbe` (`zoneLiveness.ts:88-104`) wraps `fetch` in an `AbortController` with an 800 ms timeout, and the abort path has a genuine behavioral test using a stub that resolves only on the abort signal.
- Stampede: one shared `inFlight` promise; a test with 3 concurrent callers asserts exactly 1 probe call.
- Up→down staleness: during the ≤3 s window after an outage starts, `isHealthy()` returns the stale cached `true`, the middleware calls `NextResponse.next()`, and the pre-fix bare 500 can still surface until the next probe. Disclosed in code comments and the handoff rather than hidden. A bounded, legitimate trade given the no-new-dependency constraint.
- Cost when the zone is up: a synchronous memory read; one network round trip per 3 s window, not per request.

**`/erro-de-zona`** (`pages/erro-de-zona.tsx`): no `getServerSideProps`/`getStaticProps`, no `fetch`, no zone-origin reference. Its test uses `assert.doesNotMatch` against real export syntax and would fail if a data-fetch export were added.

**`allowImportingTsExtensions`**: needed because `lib/zoneErrorPage.ts` imports `./zoneErrorContent.ts` with an explicit extension, which Node's ESM loader requires under `node --test`. Additive and minimal: it permits the extension without requiring it, and every pre-existing extensionless import still resolves (clean `tsc`).

**DAL-free**: no `fetch` or data fetching in the layout components; neither `middleware.ts` nor the new `lib/` files reach for any domain layer. `DEFAULT_SESSION` in `erro-de-zona.tsx` mirrors the existing pattern in `pages/index.tsx` (a PoC placeholder, not a credential; real session design is deferred as D3).

## 2. Logic Chain

`rewrites()` has no upstream-failure hook, so middleware is the only point that runs before the rewrite target is dispatched — the interception point is forced by the framework, not chosen arbitrarily. The fix intercepts exactly the three rewrite-covered patterns, consults a cheap cached liveness signal, and substitutes a 503 plus shared-copy HTML for the bare 500, which closes F1 as reported. What remains is the disclosed TTL staleness window and the fact that `middleware.ts` cannot be unit-imported, so its wiring is covered by regex-on-source plus one live transcript. No scope creep into F2, no new dependency, no writes outside `apps/host/`, no route swallowed by the matcher.

## 3. Findings

**None block.**

- **Minor, note only**: the middleware synthesizes the outage HTML inline instead of redirecting to `/erro-de-zona`. The stated reason (no page-rendering pipeline available before rewrite dispatch; a redirect costs an extra round trip) is defensible, and sharing the copy constant keeps the two surfaces from diverging in text. Worth revisiting only if the inline `<style>` ever has to track `globals.css` by hand.
- **Coverage gap, disclosed by the worker and confirmed real**: `middleware-config.test.ts` verifies wiring by regex against source text, because `next/server` does not resolve under plain Node. Those assertions catch a deleted matcher entry or a changed status code, but would NOT catch the health branch being inverted — both branches contain the strings `503`, `retry-after`, and `zoneLiveness` regardless of which does what. The branch logic itself has no executable regression test. Best addressed by an integration-level check rather than by blocking this round, since the live proof exercised the real branch once.

## 4. Caveats

- No `next build` and no servers were run; `challenger_m2_4` owns that this round. Confidence in the live 503 rests on re-running the unit and type checks plus the worker's transcript.
- The up→down staleness window was not measured with a live clock. That measurement belongs to `challenger_m2_4` and is the remaining unconfirmed claim.

## 5. Verdict

**APPROVE**

## 6. Verification Method

```bash
cd apps/host && node --test test/*.test.ts          # 27/27
cd apps/host && pnpm exec tsc --noEmit              # exit 0
git diff -- apps/remote-app                          # empty: F2 untouched
git diff --stat -- apps/host/package.json pnpm-lock.yaml   # empty: no new dependency
rg -n "currentTab|onTabSelect|isRemoteAvailable" apps/host  # zero hits
grep -n "fetch\|getServerSideProps\|getStaticProps" apps/host/pages/erro-de-zona.tsx
```
