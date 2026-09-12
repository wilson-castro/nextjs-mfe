# Milestone 2 Remediation Challenger Report — Iteration 3 (challenger_m2_4)

**Role:** Fresh, independent Challenger for the F1 remediation
(`apps/host/middleware.ts` + `lib/zoneLiveness.ts` + `lib/zoneErrorPage.ts` +
`pages/erro-de-zona.tsx`, per `.agents/worker_m2_fix/handoff.md`). F2 (SSE
interval leak) is human-deferred (`.agents/orchestrator/DEFERRED.md` D1) —
not re-raised as blocking, but exercised to check for regression.

All probes ran against `localhost:3000` (host) / `localhost:3001` (zone),
processes I started myself, from a clean `git status` matching the
pre-existing tree.

---

## 1. Observation (raw outputs)

### 1.1 Build

```
$ pnpm --filter remote-app build   # exit 0, ✓ Compiled successfully in 1270ms
$ pnpm --filter @mfe/host build    # exit 0, ✓ Compiled successfully in 1545ms
```
Host build output confirms both required artifacts:
```
└ ○ /erro-de-zona                         3.63 kB        88.8 kB
ƒ Middleware                              35.3 kB
```
`git status --short` immediately after both builds is byte-identical to
before the builds (`.agents/challenger_m2_4/git-status-before.log` vs.
`git-status-after-build.log`, `diff` exit 0) — no tracked file was rewritten
by the build.

### 1.2 Servers

Started with `setsid ... &`, each in its own process group, confirmed via
`ps -o pid,ppid,pgid`: zone pgid 191422 (sh 191438, next-server 191439),
host pgid 191457 (sh 191473, next-server 191474). Both `✓ Ready` in <400ms.
Full logs: `.agents/challenger_m2_4/zone.log`, `host.log`.

### 1.3 Zone-UP baseline (`probe-baseline.log`)

| Path | Status | Content-Type | Bytes | time_total |
|---|---|---|---|---|
| `/` | 200 | text/html | 5389 | 0.056s |
| `/remote-app` | 200 | text/html | 3317 | 0.196s |
| `/remote-app/api/health` | 200 | application/json, `{"ok":true}` | 11 | 0.011s |
| `/remote-app-static/_next/static/css/7328242de7a8f19b.css` (real asset pulled from zone HTML) | 200 | text/css, `cache-control: public, max-age=31536000, immutable` | 5284 | 0.021s |

All match the pre-fix baseline recorded by `challenger_m2_3`. n=1 each
(baseline sanity, not a distribution).

### 1.4 F1 repro, steady-state zone-down (`probe-f1-repro.log`)

Killed only the zone's process group (`kill -TERM -191422`), confirmed via
`ps`/`ss` that :3001 disappeared and :3000 kept listening. Then, well past
the 3s TTL (>20s had elapsed by the time of this specific probe):

```
GET /remote-app          -> HTTP/1.1 503 Service Unavailable
                             cache-control: no-store
                             content-type: text/html; charset=utf-8
                             retry-after: 5
                             body: recognizable shell error page, "Zona indisponível" /
                             "A zona remota está temporariamente fora do ar..."
GET /remote-app/api/health -> identical 503, same body
GET /                      -> HTTP/1.1 200 OK (host untouched)
```
This is the exact defect `challenger_m2_3` reported as F1, now absent in
this steady-state condition: no bare 500, correct `Content-Type`,
`Retry-After` present, shell's own copy rendered.

### 1.5 Static asset during outage (`probe-static-outage.log`)

```
GET /remote-app-static/_next/static/css/7328242de7a8f19b.css (zone down)
  -> HTTP/1.1 503, content-type: text/html; charset=utf-8, 2042 bytes
  -> body is the HTML error page, NOT a text/css response
```
Matches the worker's own documented caveat exactly ("a static-asset request
made while the zone is down gets an HTML 503 body instead of a
same-content-type failure") — confirmed as observed, not a new bug, but a
real content-type mismatch for that sub-case, exactly as predicted.

### 1.6 `/erro-de-zona` standalone, zone down

```
GET /erro-de-zona -> HTTP/1.1 200 OK, text/html, 4017 bytes
```
Renders correctly with the zone fully down, as required by
`01-operacao.md` §1.1/§5.1.

### 1.7 Staleness window — measured, not assumed (`probe-staleness-controlled.log`, `probe-staleness-headers.log`)

This is the critical falsifiable measurement of the accepted trade-off.

**Controlled reproduction:** warmed the liveness cache with one request
(`curl /remote-app`, zone healthy), then killed the zone's process group
1.9ms later, then polled `/remote-app` in a tight loop starting
immediately.

```
warm_t=1789190204.719477593  kill_t=1789190204.721414591  gap=0.0019s
req#1   t+0.000s  code=500
req#2   t+0.024s  code=500
...
req#120 t+2.933s  code=500
req#121 t+2.958s  code=503   <- first correct response
```
**120 consecutive requests over ~2.96 seconds received the bare pre-fix
500**, immediately after killing a zone whose liveness the middleware had
just cached as healthy. Full headers/body of a mid-window sample
(`probe-staleness-headers.log`, captured ~1s after kill):
```
HTTP/1.1 500 Internal Server Error
Date: ...
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

Internal Server Error
```
No `Content-Type` header, body is the literal 21-byte string
`Internal Server Error` — this is **byte-for-byte the same defect
challenger_m2_3 originally reported as F1**, reproduced inside the
documented staleness window. `/` stayed 200 throughout
(`probe-staleness-headers.log`).

**Cache-age dependency, also measured:** an earlier attempt where more
real time elapsed between the warm-up request and the kill (cache already
past its 3s TTL by the time of the kill) showed **zero** bare-500 responses
— the very first post-kill request triggered a fresh probe and got 503
immediately (`probe-staleness-full.log`). This confirms the window's width
is bounded by *time since the last successful probe*, not by the kill
event itself, exactly matching `zoneLiveness.ts`'s documented mechanism.

**This is not a new defect** — it is the exact cost the worker's own
handoff names in its Caveats section ("up to `ttlMs` worth of requests...
can still be dispatched to the (now dead) zone before the cache catches
up") and quantifies at 3000ms. My measurement (~2.96s, 120 affected
requests at this request rate) is consistent with that stated bound, not a
contradiction of it — I report it because the task explicitly asked to
measure it, not excuse it, and because a document that only says "up to
3s" without a demonstrated worst case is a weaker claim than one with
receipts.

### 1.8 Cold cache — host restarted with zone already down (`probe-cold-cache.log`)

Killed both servers, confirmed zone dead first, then started the host
alone with the zone still down, and fired the very first request the
instant the host's listen socket appeared:
```
GET /remote-app (first request ever, empty cache, zone down)
  -> HTTP/1.1 503 Service Unavailable, content-type: text/html; charset=utf-8,
     retry-after: 5, time_total=0.287s (first-request/compile overhead), correct error page body
```
**No bare-500 gap on cold start.** An empty cache forces a synchronous
probe on the very first call rather than assuming "healthy" by default, so
the worst-case staleness window does not apply to a cold boot against an
already-dead zone. This is a positive divergence worth naming in
`01-operacao.md`/the handoff: the 3s bound only applies to a zone that
*dies after* being observed healthy, not to any zone that is down before
the host ever asks.

### 1.9 Recovery timing (bounded by TTL, as claimed)

Restarted the zone, polled `/remote-app` every ~120ms starting immediately:
```
t+0.000s .. t+2.949s: all 503
t+3.165s: 200  <- RECOVERED
```
Matches the documented 3s TTL bound (measured 3.165s, consistent with one
TTL window plus polling granularity).

### 1.10 Flapping (`probe-flapping.log`)

Three clean kill/restart cycles, each waiting 3.5s (past one TTL) between
transitions, hitting `/remote-app` before and after each transition:
```
cycle 1: kill -> 503 (after 3.5s)   | restart -> 200 (after 3.5s)
cycle 2: kill -> 503 (after 3.5s)   | restart -> 200 (after 3.5s)
cycle 3: kill -> 503 (after 3.5s)   | restart -> 200 (after 3.5s)
```
No stuck state, no crash. Host process (191474, then its successors) never
died across any cycle (confirmed via `ps` between cycles).

### 1.11 Concurrency during outage (`probe-concurrency.log`)

30 concurrent `curl` requests to `/remote-app`, zone down, cache already
confirmed stale (steady-state, not the staleness window):
```
30/30 requests -> 503 (uniq -c: "30 code=503")
time_total range: 0.016s - 0.070s
host / -> 200 immediately after
```
**Caveat on stampede counting:** I could not count probe attempts on the
zone side, because the zone is down during this test by construction (no
process to receive or log a probe), and `next start` in production mode
does not emit a per-request access log I could grep even when it is up.
The only direct evidence for the "exactly one probe, concurrent callers
share it" claim is the worker's own unit test
(`zone-liveness.test.ts`: "isHealthy() de-duplicates concurrent probes in
flight") which I did not re-execute (`node --test` / `tsx` is out of
bounds per my instructions). Functionally, all 30 concurrent requests
during a steady-state outage got the correct, consistent 503 with no
errors or timeouts, which is consistent with de-duplication but does not
by itself measure it.

### 1.12 Overhead when healthy (`probe-overhead.log`, n=20 each)

```
via host :3000/remote-app   avg 9.39ms  (range 5.7ms-43.1ms, one outlier at 43ms — likely a
                                          scheduling blip, first sample in the run)
direct zone :3001/remote-app avg 3.25ms (range 2.9ms-3.6ms)
```
Added latency through the host+middleware+rewrite path, healthy case:
**~6.1ms average** on this machine (excluding the one 43ms outlier, which
if included raises the host average to ~9.4ms). This single machine's
numbers are not a capacity claim — no concurrent load was applied, and
other processes (a running Postgres, CUPS, a service on 7070) share the
same host; see Caveats.

### 1.13 SSE still works when healthy (`probe-sse.log`)

`curl -N --max-time 8` against `/remote-app/api/sse-events` through the
host:
```
t+0.028s: event: connected
t+0.033s: data: {"status":"connected",...}
t+1.530s: data: {...evt_..., "value":35.7}
t+3.029s: data: {...}
t+4.532s: data: {...}
t+6.032s: data: {...}
t+7.533s: data: {...}
```
Events arrive incrementally at ~1.5s intervals (matching the server's
`setInterval(1500)`), not buffered until stream close. The middleware does
not break or buffer SSE — same behavior `challenger_m2_3` observed
pre-fix.

### 1.14 SSE leak (D1) — verified not worsened, and independently narrowed

Per the task's ask to confirm the middleware didn't make D1 worse, and
going one step further than `challenger_m2_3` could (their own caveat:
"I did not isolate host-rewrite vs. direct-zone-only"):

```
3s SSE connection via host (:3000/remote-app/api/sse-events), client-closed by `timeout 3 curl`:
  zone log: SSE_CLIENT_CONNECTED logged, SSE_CLIENT_DISCONNECTED never logged (checked immediately and again after +5s)

3s SSE connection direct to zone (:3001/remote-app/api/sse-events), same client-close pattern, NO middleware/rewrite involved at all:
  zone log: SSE_CLIENT_CONNECTED logged, SSE_CLIENT_DISCONNECTED never logged either
```
**Finding (informational, not blocking — D1 stays deferred per the human's
decision):** the leak reproduces identically with the rewrite/middleware
completely out of the picture. This directly resolves the open question in
`challenger_m2_3`'s own caveats and confirms the deferral's premise in
`DEFERRED.md` D1 ("does `close` fail only behind the rewrite, or also
direct on :3001?") — it also fails direct on :3001, so it is a zone-owned
defect, not something the middleware introduced or worsened. n=2 short
connections observed here (3s each); not a full re-run of the original
n=1/6-hour leak measurement.

### 1.15 Full smoke suite

```
$ node scripts/smoke-test.mjs --strict
Total tests: 16, Passed: 16, Failed: 0, Skipped: 0
```
16/16, unchanged, both static and online tiers green
(`.agents/challenger_m2_4/smoke-strict.log`).

### 1.16 Cleanup

```
$ kill -TERM -196540 -196658   # host and zone process groups, final instances
$ ps -ef | grep -E "next-server|next start" | grep -v grep
(no output)
$ ss -ltn
LISTEN 0 4096   127.0.0.54:53
LISTEN 0 4096    127.0.0.1:631
LISTEN 0 10          0.0.0.0:7070
LISTEN 0 4096  127.0.0.53%lo:53
LISTEN 0 200       127.0.0.1:5432
LISTEN 0 4096          [::1]:631
LISTEN 0 10             [::]:7070
```
No entry for 3000/3001. Pre-existing listeners (DNS, CUPS, Postgres, 7070)
untouched.

`git status --short` at the end is unchanged from the start of my session
(`Header.tsx`/`SideNavigation.tsx`/`tsconfig.json` diffs are the worker's
own §1.5 cleanup, pre-existing before I began; `.agents/auditor_m2_3/` and
`.agents/reviewer_m2_4/` appeared mid-session from concurrent agents I did
not touch). No file was modified by me; nothing committed.

---

## 2. Logic Chain

1. The middleware-based fix correctly intercepts the failure mode
   `challenger_m2_3` found: a zone confirmed dead for longer than one TTL
   window never again produces a bare 500, in steady state, on repeated
   probing, under 30-way concurrency, across three flap cycles, and on cold
   host boot against an already-dead zone.
2. The one condition under which the original bug still reproduces exactly
   — byte-for-byte, same missing `Content-Type`, same literal
   `Internal Server Error` body — is the staleness window the worker's own
   handoff already named and bounded at the TTL (3000ms). I measured that
   window directly: ~2.96s wide, 120 affected requests at my polling rate,
   consistent with (not exceeding) the documented bound. The fix does not
   eliminate F1; it bounds F1's blast radius to a window whose width is
   itself a config constant (`DEFAULT_TTL_MS`).
3. Static assets during outage get a content-type mismatch (HTML 503 body
   instead of text/css/js), exactly as the worker's own caveat predicted —
   confirmed observed, not a new gap.
4. Cold-cache boot against an already-dead zone has no bare-500 gap at all
   — the empty-cache path forces a synchronous probe rather than assuming
   health, which is a stronger guarantee than the "up to 3s" framing
   implies for that specific case and is worth stating explicitly in the
   docs rather than leaving readers to infer it.
5. SSE through the host is unaffected by the middleware (still
   incremental, not buffered), and the D1 leak — independently reproduced
   here hitting the zone directly with no middleware in the path at all —
   is confirmed to be pre-existing zone behavior, not something this fix
   introduced or worsened. This closes the specific ambiguity
   `challenger_m2_3` flagged as unresolved.
6. The smoke suite and both production builds remain fully green with zero
   tracked-file drift, so the fix is stable under the same construction
   checks the previous iteration passed.

---

## 3. Findings by severity

### Important

**F1-residual — The original bare-500 defect still reproduces exactly, inside a measured ~3-second window after a zone dies while its liveness was cached healthy.**
Evidence: §1.7 above. 120/120 requests in the reproduced window got
`HTTP/1.1 500 Internal Server Error`, no `Content-Type`, body
`Internal Server Error` — identical to the pre-fix defect
`challenger_m2_3` reported. This is not a new defect and not a regression;
it is the explicit, named cost of the chosen fix, and the worker's own
handoff already discloses it as a caveat with the same number (3000ms).
I am not raising this as something to block on beyond what's already
disclosed — I am converting "documented as a caveat" into "measured and
confirmed to match the disclosed bound," which is what this round asked
for.
Fix / doc action: `docs/design-bff/mfe/01-operacao.md` §5.1 currently reads
as an unconditional guarantee ("Zona inteira fora → shell serve
`/erro-de-zona`"). It should gain one clause: *"...exceto por uma janela
de até `DEFAULT_TTL_MS` (3s) após a zona cair, caso o cache de liveness
ainda a considere saudável; medido em ~2.96s / 120 requisições consecutivas
no pior caso observado."* Anyone deploying this needs to know a health
check downstream of `/remote-app` can still see a bare 500 for up to ~3s
per outage-start event, not zero.

### Minor / informational

**Static-asset content-type mismatch during outage, confirmed as predicted.**
§1.5. `/remote-app-static/*` returns an HTML 503 body instead of a
same-content-type failure while the zone is down. Already disclosed by the
worker as an accepted trade-off; I confirm it reproduces exactly as
described. No action required beyond what's already written, unless a
future consumer parses `/remote-app-static/*` responses expecting CSS/JS
even on error (a `<link>`/`<script>` tag will just fail to apply/execute,
which is a safe failure mode, not a security concern).

**Cold-cache boot has a stronger guarantee than the general "up to 3s" framing suggests — worth stating.**
§1.8. A zone that is already down before the host's first request has zero
bare-500 exposure, because the cache-miss path always synchronously probes
rather than assuming "healthy." This asymmetry (dying-after-healthy vs.
already-dead-at-boot) is real and favorable, but isn't visible from reading
`01-operacao.md` or the worker's handoff alone. Suggest documenting it so
an on-call reader doesn't over-estimate risk on the more common "host
restarts after a zone outage" path.

**D1 (SSE leak) confirmed pre-existing / zone-owned, not rewrite-specific — informational only, does not change the deferral.**
§1.14. Independently resolves `challenger_m2_3`'s own open caveat. Reproduces
identically hitting the zone directly on :3001 with no middleware or
rewrite involved. Supports `DEFERRED.md` D1's classification as
zone-owned/M1-scoped, not something this remediation touched or worsened.
No action needed against this milestone's gate.

**Probe-stampede de-duplication not independently verified live.**
§1.11. I could not observe probe attempts server-side (zone has no
per-request access log in production mode, and is by definition down
during the exact test that would exercise stampede behavior). The only
evidence for "concurrent callers share one in-flight probe" is the
worker's unit test, which I did not re-execute. The 30-concurrent-request
functional result (30/30 correct 503, no errors) is consistent with correct
de-duplication but is not itself a measurement of request count against
the zone. Flagging the gap rather than treating the unit test's claim as
independently confirmed.

---

## 4. Caveats

- **Staleness-window measurement is single-condition-controlled, not a distribution.** I reproduced the ~2.96s/120-request window twice under
  slightly different timing (one attempt with a stale-already cache showed
  zero affected requests, one controlled attempt with a freshly-warmed
  cache showed the full window) to establish that the width is a function
  of cache age at kill-time, not a fixed constant independent of it. I did
  not run n≥10 repetitions of the controlled case to build a distribution
  of the window's width; I report two illustrative points (0 requests,
  120 requests) that bracket the mechanism, not a percentile.
- **Overhead measurement (§1.12) is n=20 per side, sequential, single
  machine, no concurrent load.** Other processes were running on this
  machine throughout (a pre-existing Postgres on 5432, CUPS, a service on
  7070, plus my own shell/tool overhead) — I did not isolate CPU
  contention, so the ~6ms average added-latency figure is directional, not
  a guaranteed bound under production load.
- **Probe-stampede count is not directly observable** with the tools and
  constraints given (no `tsx`/`pnpm test`, zone has no per-request log in
  `next start` production mode, and the zone is down during the exact
  window that would need to be measured). See F-minor above.
- **D1 (SSE leak) was re-touched only to the extent needed to answer "did
  the middleware make it worse."** I did not re-run the original 6-hour,
  15,544-broadcast measurement or attempt a distribution across multiple
  concurrent SSE clients — that remains exactly as scoped and deferred in
  `DEFERRED.md`.
- **No adversarial/security probes were run** (Family 1 framing from
  `06-seguranca.md` etc. does not apply — this milestone still has no
  `/pedidos`, session cookie, or domain layer, same as `challenger_m2_3`
  found).
- I did not run `pnpm test`, `npx tsx`, or `pnpm install`, and did not
  modify any tracked source file. All `.agents/**` files are new,
  untracked, and mine except where noted as concurrent/pre-existing.

---

## 5. Verification Method

```bash
# Build
pnpm --filter remote-app build && pnpm --filter @mfe/host build
git status --short   # confirm no tracked-file drift

# Start (own process groups)
setsid pnpm --filter remote-app start > zone.log 2>&1 < /dev/null &
setsid pnpm --filter @mfe/host start  > host.log 2>&1 < /dev/null &

# Baseline
curl -i http://localhost:3000/remote-app
curl -i http://localhost:3000/remote-app/api/health

# F1 repro (steady state)
kill -TERM -<zone-pgid>; sleep 20
curl -i http://localhost:3000/remote-app   # expect 503, html, retry-after

# Staleness window (controlled)
curl -s -o /dev/null http://localhost:3000/remote-app   # warm cache
kill -TERM -<zone-pgid>                                  # kill immediately after
# then poll /remote-app in a tight loop; expect ~3s of bare 500 before 503 appears

# Cold cache
kill -TERM -<host-pgid> -<zone-pgid>   # zone dead first
setsid pnpm --filter @mfe/host start &
curl -i http://localhost:3000/remote-app   # very first request; expect 503 not 500

# SSE direct-vs-rewrite leak isolation
timeout 3 curl -N http://localhost:3000/remote-app/api/sse-events > /dev/null
timeout 3 curl -N http://localhost:3001/remote-app/api/sse-events > /dev/null
grep SSE_CLIENT_DISCONNECTED zone.log   # expect absent in both cases

# Full suite
node scripts/smoke-test.mjs --strict   # expect 16/16

# Cleanup
kill -TERM -<host-pgid> -<zone-pgid>
ss -ltn | grep -E ':3000|:3001'   # expect no output
```

---

## What I did not execute

- A repeated-trial distribution (n≥10) of the staleness window's exact
  width/request-count — I demonstrated the mechanism and one worst-case
  point (~2.96s / 120 requests) plus one best-case point (0 requests, stale
  cache at kill time), not a percentile spread.
- Direct server-side counting of liveness-probe invocations during the
  concurrency test — no access log available in production mode, and the
  zone is down by construction during that exact test.
- Re-running any of the worker's own `node --test` unit test files
  (`zone-liveness.test.ts`, `zone-error-page.test.ts`,
  `erro-de-zona-page.test.ts`, `middleware-config.test.ts`) — `tsx`/`pnpm
  test` are out of bounds per my instructions; I relied on live HTTP
  behavior instead, which is a different, complementary kind of evidence,
  not a substitute for re-executing those tests myself.
- Any adversarial/security probe from the `06-seguranca.md` /
  `08-desempenho.md` framing — no such routes, session model, or domain
  layer exist in this codebase at this milestone (confirmed by
  `challenger_m2_3` previously and unchanged here).
- Load/percentile measurement under sustained concurrent traffic, or a
  controlled-network-latency injection between host and zone — out of
  scope for this remediation-verification round, which is specifically
  about F1's fix, not `08-desempenho.md`'s broader claims.
- A full re-run of the original D1 leak measurement (6+ hours, thousands of
  broadcasts) — only a short (3s) confirmatory reproduction was done, on
  both the rewrite and direct-zone paths, to answer the narrow question
  this round asked ("did the middleware make it worse").

---

## Verdict

APPROVE
