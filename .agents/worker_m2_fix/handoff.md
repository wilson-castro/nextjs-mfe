# Milestone 2 Remediation — F1 (worker_m2_fix)

**Scope:** Fix F1 only (bare 500 on zone outage instead of the shell's own
`/erro-de-zona`). F2 (SSE handler leak) is human-deferred and untouched —
`apps/remote-app/pages/api/sse-events.ts` was not opened.

---

## 1. Observation (raw outputs)

### 1.1 Red phase — new tests fail against the pre-fix codebase

Four new test files were written before any implementation existed
(`apps/host/test/zone-liveness.test.ts`, `zone-error-page.test.ts`,
`erro-de-zona-page.test.ts`, `middleware-config.test.ts`). First run,
against the unmodified repo:

```
$ cd apps/host && node --test test/*.test.ts
...
✔ reactStrictMode is enabled in host next.config.js
✔ next.config.js exports rewrites as an async function
✔ rewrites returns an array containing exactly 3 rewrite rules
✔ rewrites contains the 3 required Multi-Zones routing rules
✔ rewrites dynamically respects REMOTE_ZONE_URL environment variable override
✔ rewrites dynamically respects REMOTE_APP_URL fallback environment variable
node:internal/modules/esm/resolve:274
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/host/lib/zoneErrorPage'
    imported from '.../apps/host/test/zone-error-page.test.ts'
node:internal/modules/esm/resolve:274
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/host/lib/zoneLiveness'
    imported from '.../apps/host/test/zone-liveness.test.ts'
...
ℹ tests 10
ℹ pass 6
ℹ fail 4
```

(`erro-de-zona-page.test.ts` and `middleware-config.test.ts` failed first on
my own bug — `__dirname` used in an ES module — fixed with
`fileURLToPath(import.meta.url)`; after that fix they failed correctly with
`AssertionError: expected .../middleware.ts to exist` /
`.../pages/erro-de-zona.tsx to exist`, i.e. still red, for the right reason.)

This is real evidence of the defect from a second angle, independent of the
challenger's curl probes: the routes and modules the docs and tests demand
(`docs/design-bff/mfe/01-operacao.md` §1.1/§5.1, `00-arquitetura.md` §2.3,
`TEST_INFRA.md` T1-F5-05/T2-F5-04) did not exist in the repo at all.

### 1.2 Green phase — after implementation

```
$ cd apps/host && node --test test/*.test.ts
✔ pages/erro-de-zona.tsx exists
✔ pages/erro-de-zona.tsx has no server-side data fetching (getServerSideProps/getStaticProps)
✔ pages/erro-de-zona.tsx never calls fetch() or reaches for the remote zone URL
✔ pages/erro-de-zona.tsx exports a default React component
✔ pages/erro-de-zona.tsx renders the shared shell error copy
✔ middleware.ts exists at the host app root
✔ middleware.ts matcher covers the zone root, zone sub-routes, and zone static assets
✔ middleware.ts responds 503 with Retry-After when the zone is unhealthy, not a bare 500
✔ middleware.ts consults the shared zone liveness cache rather than probing on every request inline
✔ reactStrictMode is enabled in host next.config.js
✔ next.config.js exports rewrites as an async function
✔ rewrites returns an array containing exactly 3 rewrite rules
✔ rewrites contains the 3 required Multi-Zones routing rules
✔ rewrites dynamically respects REMOTE_ZONE_URL environment variable override
✔ rewrites dynamically respects REMOTE_APP_URL fallback environment variable
✔ renderZoneErrorHtml() returns a full standalone HTML document
✔ renderZoneErrorHtml() contains the shared shell error copy
✔ renderZoneErrorHtml() is inert: no <script> tags, no domain/zone fetch calls
✔ renderZoneErrorHtml() output does not depend on any runtime input (deterministic, standalone)
✔ isHealthy() calls the probe exactly once for repeated calls inside the TTL window
✔ isHealthy() re-probes once the TTL window has elapsed
✔ isHealthy() reflects a transition from healthy to unhealthy after the TTL expires
✔ isHealthy() de-duplicates concurrent probes in flight (no probe stampede)
✔ createFetchProbe() returns true when the health endpoint responds ok
✔ createFetchProbe() returns false when fetch rejects (connection refused)
✔ createFetchProbe() returns false when the health endpoint responds with a non-2xx status
✔ createFetchProbe() aborts and returns false when the probe exceeds its timeout

ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

This also re-ran cleanly a second time after the secondary dead-props
cleanup (§1.5) — identical `tests 27 / pass 27 / fail 0`.

### 1.3 `tsc --noEmit`

```
$ cd apps/host && pnpm exec tsc --noEmit
(no output, exit 0)
```
Ran both before and after the dead-props cleanup; clean both times.

Note: `apps/host/tsconfig.json` gained one line,
`"allowImportingTsExtensions": true`, alongside the pre-existing
`"noEmit": true` (TS requires that pairing). This was needed because
`lib/zoneErrorPage.ts` imports `lib/zoneErrorContent.ts` with an explicit
`.ts` extension — required for the *test* of `zoneErrorPage.ts` to resolve
under plain `node --test` (see §2, "why explicit `.ts` extensions"). It only
loosens what tsc *permits*; it does not require the extension anywhere else
in the codebase, and every pre-existing extensionless import
(`from '../lib/session'` etc.) keeps working unchanged.

### 1.4 Builds

```
$ pnpm --filter remote-app build
 ✓ Compiled successfully in 1336ms
 ✓ Generating static pages (3/3)
Route (pages): / , /_fragmento/[name]/[id], /404, /500,
               /api/fragmento/[name]/[id], /api/health, /api/server-data, /api/sse-events

$ pnpm --filter @mfe/host build
 ✓ Compiled successfully in 1836ms
 ✓ Generating static pages (3/3)
Route (pages)                                Size  First Load JS
┌ ƒ /                                     4.06 kB        89.2 kB
├   /_app                                     0 B        85.2 kB
├ ○ /404                                    301 B        85.5 kB
├ ○ /500                                    296 B        85.5 kB
└ ○ /erro-de-zona                         3.63 kB        88.8 kB
ƒ Middleware                              35.3 kB
```
`/erro-de-zona` is marked `○` (Static) — prerendered, zero runtime
dependency by construction, matching `TEST_INFRA.md` T2-F5-04's own wording
("served **statically** by shell").

### 1.5 Secondary cleanup (dead props)

Grepped for callers first: `rg "currentTab|onTabSelect|isRemoteAvailable" apps/host`
found zero callers passing any of the three (only the declarations/internal
use). Removed `currentTab`/`onTabSelect` from `SideNavigationProps`
(`components/SideNavigation.tsx`, previously unused inside the component
too — it doesn't even destructure props) and `isRemoteAvailable` from
`HeaderProps` (`components/Header.tsx`), collapsing the status-pill JSX to
the single branch every real caller already exercised (`isRemoteAvailable`
was always `undefined` in practice). `tsc --noEmit` and
`node --test test/*.test.ts` re-run clean after this change (§1.2, §1.3);
did it before the final build/live-proof pass, so those artifacts already
reflect it.

### 1.6 Live proof — the actual repro from the challenger's handoff, re-run

Both servers started from a clean process check (`ss -ltn` showed 3000/3001
free beforehand):

```
Zone (3001): ✓ Ready in 420ms
Host (3000): ✓ Ready in 421ms
```

Happy path, zone up:
```
GET /                          -> 200
GET /remote-app                -> 200, content-type: text/html; charset=utf-8, 3317 bytes
GET /remote-app/api/health     -> 200, content-type: application/json; charset=utf-8, {"ok":true}
```

Killed **only** the zone (`kill -TERM <sh-parent-pid> <next-server-pid>`,
verified via `ps`/`ss` that :3001 was gone and :3000 still listening):

```
=== GET /remote-app ===
HTTP/1.1 503 Service Unavailable
cache-control: no-store
content-type: text/html; charset=utf-8
retry-after: 5
...
<!doctype html>
<html lang="pt-BR">
...
<h1>Zona indisponível</h1>
<p>A zona remota está temporariamente fora do ar. O shell continua
funcionando normalmente; esta seção específica volta assim que o processo
da zona for restabelecido.</p>
...

=== GET /remote-app/api/health ===
HTTP/1.1 503 Service Unavailable
content-type: text/html; charset=utf-8
retry-after: 5
... (identical body)

=== GET / (host must stay up) ===
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

This is the exact defect from the challenger's F1 report
(`.agents/challenger_m2_3/handoff.md` §1.6 — previously a bare
`HTTP/1.1 500 Internal Server Error` with **no** `Content-Type` and body
`Internal Server Error`), now replaced by a deliberate `503` with
`Retry-After`, correct `Content-Type`, and the shell's own recognizable
error page. `/` on the host was completely unaffected throughout.

Standalone route check, zone still down:
```
GET /erro-de-zona -> 200, content-type: text/html; charset=utf-8, 4017 bytes
```
Confirms `/erro-de-zona` exists and renders with **every** zone down, per
T2-F5-04 and `01-operacao.md` §1.1.

Restarted the zone, waited past the liveness cache's 3-second TTL, then
re-checked through the host:
```
GET /remote-app             -> 200
GET /remote-app/api/health  -> 200, {"ok":true}
```
Recovery confirmed.

### 1.7 `node scripts/smoke-test.mjs --strict`

Run twice: once immediately after the live-proof pass, and once again after
rebuilding `@mfe/host` with the secondary dead-props cleanup and restarting
it. Both runs:
```
Execution Summary:
  Total tests:   16
  Passed:        16
  Failed:        0
  Skipped:       0
```
16/16 both times — unchanged from the challenger's pre-fix baseline.

### 1.8 Cleanup

```
$ kill -TERM -<host-pgid> -<zone-pgid>
$ ps aux | grep -E "next-server|next start" | grep -v grep
(no output)
$ ss -ltn
State  Recv-Q Send-Q Local Address:Port
LISTEN 0      4096      127.0.0.54:53
LISTEN 0      4096       127.0.0.1:631
LISTEN 0      10           0.0.0.0:7070
LISTEN 0      4096   127.0.0.53%lo:53
LISTEN 0      200        127.0.0.1:5432
LISTEN 0      4096           [::1]:631
LISTEN 0      10              [::]:7070
```
No entry for 3000 or 3001. Pre-existing listeners (DNS, CUPS, Postgres,
7070) untouched, matching the challenger's own baseline.

`git status --short` at the end:
```
 M .agents/orchestrator/BRIEFING.md      (not mine; pre-existing/concurrent)
 M .agents/orchestrator/GATE_STATUS.md   (not mine; pre-existing/concurrent)
 M .agents/orchestrator/progress.md      (not mine; pre-existing/concurrent)
 M apps/host/components/Header.tsx
 M apps/host/components/SideNavigation.tsx
 M apps/host/tsconfig.json
?? apps/host/lib/zoneErrorContent.ts
?? apps/host/lib/zoneErrorPage.ts
?? apps/host/lib/zoneLiveness.ts
?? apps/host/middleware.ts
?? apps/host/pages/erro-de-zona.tsx
?? apps/host/test/erro-de-zona-page.test.ts
?? apps/host/test/middleware-config.test.ts
?? apps/host/test/zone-error-page.test.ts
?? apps/host/test/zone-liveness.test.ts
?? apps/host/tsconfig.tsbuildinfo          (pre-existing untracked build artifact, F4 in prior report)
```
No file outside `apps/host/` (my owned surface for this fix) was touched.
Nothing committed.

---

## 2. Logic Chain

**The problem, precisely.** `apps/host/next.config.js`'s `rewrites()`
proxies `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*` to
the zone. Next.js's rewrite mechanism has no failure hook: when the upstream
TCP connect fails, Next's own internal server raises the error and answers
with the bare Node HTTP default *before* any shell route, including
`pages/500.tsx`, ever runs. `01-operacao.md` §5.1 states the required
behavior in one line: "Zona inteira fora → shell serve `/erro-de-zona` |
rewrite falha, shell trata" (rewrite fails, the shell handles it) — but
nothing in the shell *could* handle it, because nothing ran before the proxy
error surfaced.

**Where interception is actually possible.** The only point in the Next.js
request lifecycle that runs *before* a `rewrites()` target is dispatched is
middleware (`middleware.ts` at the app root). This is true for both routers
(pages or app) and is unaffected by whether the rewrite eventually succeeds
or fails — middleware can pre-empt the rewrite for a path entirely, which is
exactly the lever needed here.

**Options weighed (per the task's explicit ask):**

1. **Chosen: Next.js middleware + short-TTL cached liveness probe.**
   `lib/zoneLiveness.ts` implements a pure (no `next/server` import),
   TTL-cached liveness cache: within the TTL window (3s), `isHealthy()` is a
   plain memory read; on a cache miss, exactly one probe fires and
   concurrent callers share it (no stampede) via an `inFlight` promise.
   `middleware.ts` matches the same three path patterns as the rewrite
   rules and asks the cache; on a cache-confirmed outage it answers directly
   with a `503` + the shell's own HTML instead of letting the request reach
   `rewrites()` at all; when healthy, it's `NextResponse.next()` — a no-op
   that leaves the existing rewrite behavior completely untouched.
   - **Cost per request:** near zero while healthy — a cache hit, not a
     network call. Only one request per TTL window pays for a real probe,
     and that probe hits the zone's own cheap `/api/health` (F8: no domain
     I/O) with an 800ms hard timeout.
   - **Staleness:** bounded by the TTL (3s). If the zone dies mid-window,
     up to ~3s of requests can still reach the (now dead) zone and get the
     pre-fix bare 500 before the next probe catches it. Documented as a
     caveat, not eliminated — see §3.
   - **Coverage:** the middleware `matcher` config covers all three
     rewrite-rule path patterns identically (`/remote-app`,
     `/remote-app/:path*`, `/remote-app-static/:path*`), so the fix isn't
     scoped only to the two paths the challenger's repro hit.

2. **Rejected: shell-owned proxy API route** that itself `fetch()`es
   upstream and catches the connection error per request. This would give
   zero staleness (always accurate) but at the cost of reimplementing, for
   every single request (not just during an outage), everything `rewrites()`
   already does for free — including the streaming passthrough the SSE path
   already depends on (per the challenger's own probe:
   `.agents/challenger_m2_3/handoff.md` §1.4, "Events arrive incrementally,
   not buffered until close"). That's a permanent per-request cost and a
   real risk of regressing SSE, taken on to fix a problem that only exists
   during outages.

3. **Rejected: probe on every single request, no cache.** Removes
   staleness entirely but adds one network round-trip to every zone request
   while healthy — the common case, by far — which is the "cost per
   request" trade-off the task explicitly asked to weigh, and it loses that
   trade badly for a benefit (perfect real-time detection) the TTL window
   below can bound well enough.

4. **Rejected: probe once at boot, cache forever.** Eliminates the
   probe cost entirely but an outage starting any time after boot would
   never be detected — the opposite failure mode from what's being fixed.

**Status code: `503 Service Unavailable` with `Retry-After: 5`, not `500`.**
A bare, contentless `500` is precisely the defect being replaced. `503` is
the standard HTTP semantic for "a dependency this server needs is currently
unavailable, this is probably temporary" — which is exactly what a
zone-down condition is from the shell's point of view, and it's the same
convention this repo's own docs already use elsewhere
(`docs/design-bff/comum/docs/PENDENCIAS.md` line 377: "`503` com
`Retry-After` acima do limite, em vez de enfileirar" for its own
overload-shedding case). `Retry-After: 5` gives a concrete, if approximate,
signal for when to retry, loosely matching the liveness TTL.

**Why the fallback HTML is a hand-written string, not rendered React.**
`middleware.ts` runs in the Edge runtime by default, before any Next.js
page-rendering pipeline exists to invoke — there is no React tree to render
at that point without adding a new dependency (a React-in-Edge SSR helper),
which the plan's global constraints forbid. `lib/zoneErrorPage.ts` instead
exports `renderZoneErrorHtml()`, a plain template-string HTML document whose
colors/spacing mirror `apps/host/styles/globals.css` (the same
`--accent-remote`, dark shell theme, offline status dot used elsewhere in
the app) so it reads as the same product as the real page. The actual
`pages/erro-de-zona.tsx` (reached by direct navigation, or a bookmark) is a
normal, statically-generated (`○`) React page built with `HostLayout` —
zero server-side data fetching, zero fetch, zero reference to the zone's
origin, by construction. Both pull their copy strings from one shared
module, `lib/zoneErrorContent.ts`, so the two render paths cannot drift out
of text sync even though their rendering *mechanism* differs (this
duplication of markup, not copy, is a deliberate, documented trade-off — see
Caveats).

**Why the shell stays DAL-free.** Nothing added here touches a domain
service. `lib/zoneLiveness.ts`'s only network call is to the zone's own
`/api/health`, which is explicitly a process-liveness check with "zero
domain I/O" per its own docstring in `apps/remote-app/pages/api/health.ts`
and per `01-operacao.md` §5.2's own warning against exactly the opposite
("Health check que consulta o domínio transforma indisponibilidade do
domínio em indisponibilidade da zona"). `pages/erro-de-zona.tsx` reuses
`HostLayout`, which itself has zero fetches (confirmed by reading
`Header.tsx`/`SideNavigation.tsx`/`HostLayout.tsx` — the same invariant
`pages/index.tsx` already relies on).

---

## 3. Caveats

- **Staleness window.** As documented above, a zone that dies is only
  detected on the next liveness probe, up to 3 seconds later (the chosen
  TTL). During that window, a request can still reach the dead zone and
  reproduce the pre-fix bare 500. This is an accepted, bounded trade-off,
  not a full fix of every millisecond of an outage; 3s was chosen as a
  reasonable balance for a dev/PoC-scale deployment and is a single named
  constant (`DEFAULT_TTL_MS` in `lib/zoneLiveness.ts`) if a future milestone
  wants to tune it.
- **`/remote-app-static/:path*` is covered by the same fallback**, meaning
  a static-asset request (JS/CSS) made while the zone is down gets an HTML
  503 body instead of a same-content-type failure. This is intentional
  (uniform coverage, per the task's explicit ask to evaluate whether static
  assets should be covered too) but is a minor content-type mismatch for
  that one sub-case; in practice, by the time an asset request would fire,
  the page that referenced it already failed to load via the same mechanism
  (its own `/remote-app*` request would have hit this same fallback first),
  so this mostly matters for stale cached HTML making a asset request after
  the outage began.
- **Two render mechanisms, one copy source.** `lib/zoneErrorPage.ts` (a
  plain string) and `pages/erro-de-zona.tsx` (JSX via `HostLayout`) are
  deliberately two different code paths, kept from drifting apart only by
  sharing `lib/zoneErrorContent.ts`'s text constants, not by sharing markup.
  A future change to the shell's visual language (e.g. a new CSS variable
  in `globals.css`) would need to be applied to both files by hand.
- **`allowImportingTsExtensions: true`** was added to
  `apps/host/tsconfig.json` solely so `lib/zoneErrorPage.ts` could import
  `lib/zoneErrorContent.ts` with an explicit `.ts` extension — required for
  `node --test` to resolve it (Node's ESM loader does no extension
  inference, unlike its CJS `require`; this is a pre-existing, repo-wide
  characteristic — I independently reproduced the same
  `ERR_MODULE_NOT_FOUND` against `apps/remote-app/test/health.test.ts`'s
  own extensionless import of `../pages/api/health`, confirming this is not
  something I introduced). This option only *permits* the extension; every
  pre-existing extensionless import elsewhere in the codebase is untouched
  and keeps resolving normally under both `tsc` (bundler resolution) and
  Next's own bundler.
- **`middleware.ts` itself is not, and cannot be, imported by any
  `node --test` file** — `next/server` has no explicit-extension-free
  resolution path under plain Node (`next` publishes no `exports` map;
  `import('next/server')` fails, `import('next/server.js')` works, and a
  bare specifier in a `.ts` source file follows the former). It is
  exercised only by the live-proof run (§1.6) and indirectly by its own
  static-source tests (`middleware-config.test.ts`), which assert on its
  text rather than importing it. This is a real gap in *unit* coverage of
  the wiring; the live end-to-end proof is what actually exercises the
  running middleware.
- **F2 (SSE leak) is untouched**, as instructed — deferred by the human,
  `apps/remote-app/pages/api/sse-events.ts` was not opened or modified.
- Secondary cleanup (dead props) touched two files outside the direct scope
  of F1 (`Header.tsx`, `SideNavigation.tsx`); done only after confirming
  zero callers via grep, and re-verified with a full clean `tsc`/test run
  and rebuild afterward, per the "only if it stays zero-risk" instruction.

---

## 4. Conclusion

F1 is fixed. `GET /remote-app` and `GET /remote-app/api/health` through the
host now return `503 Service Unavailable`, `Content-Type: text/html;
charset=utf-8`, `Retry-After: 5`, and the shell's own recognizable outage
page when the zone is down — never the bare, headerless 500 the challenger
found. `/erro-de-zona` exists as a standalone, statically-generated route
(`apps/host/pages/erro-de-zona.tsx`) that renders with zero dependency on
the zone, satisfying both `01-operacao.md` §1.1/§5.1 and `TEST_INFRA.md`
T1-F5-05/T2-F5-04. The mechanism (`apps/host/middleware.ts` +
`apps/host/lib/zoneLiveness.ts`) adds no new npm dependency, keeps the shell
DAL-free, and leaves the three existing rewrite rules and their 6
`rewrites.test.ts` tests completely untouched — verified passing before and
after. The full smoke suite stayed 16/16 across two separate runs (before
and after the secondary cleanup + host rebuild). F2 was not touched.

---

## 5. Verification Method

```bash
# TDD: new tests fail first (record output), then implementation, then pass
cd apps/host && node --test test/*.test.ts        # red, then green (27/27)

# Types
cd apps/host && pnpm exec tsc --noEmit             # clean, exit 0

# Builds
pnpm --filter remote-app build
pnpm --filter @mfe/host build                      # /erro-de-zona is ○ (Static), Middleware present

# Live proof (from repo root)
setsid pnpm --filter remote-app start > /tmp/zone.log 2>&1 < /dev/null &
setsid pnpm --filter @mfe/host start  > /tmp/host.log 2>&1 < /dev/null &
# wait for both "Ready"
curl -s -i http://localhost:3000/remote-app             # 200, zone up
curl -s -i http://localhost:3000/remote-app/api/health  # 200, zone up

kill -TERM <zone-sh-pid> <zone-next-server-pid>          # kill ONLY the zone
curl -s -i http://localhost:3000/remote-app              # 503, Retry-After, HTML error page
curl -s -i http://localhost:3000/remote-app/api/health   # 503, same
curl -s -i http://localhost:3000/                        # 200, host unaffected
curl -s -i http://localhost:3000/erro-de-zona             # 200, standalone, zone still down

setsid pnpm --filter remote-app start > /tmp/zone2.log 2>&1 < /dev/null &
sleep 4   # past the 3s liveness TTL
curl -s -i http://localhost:3000/remote-app              # 200, recovered
curl -s -i http://localhost:3000/remote-app/api/health   # 200, recovered

node scripts/smoke-test.mjs --strict                      # 16/16

# Mandatory cleanup
kill -TERM -<host-pgid> -<zone-pgid>
ss -ltn | grep -E ':3000|:3001'                           # expect no output
```
