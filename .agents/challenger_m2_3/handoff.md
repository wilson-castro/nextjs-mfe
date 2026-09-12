# Milestone 2 Challenger Report — Host Shell Multi-Zones (challenger_m2_3)

**Role:** Fresh, independent Challenger. No prior M2 triad verdict existed to build on;
everything below was executed by this agent, from a clean `git status`, on ports 3000/3001
that were free at start.

---

## 1. Observation (raw outputs)

### 1.1 Build

`pnpm --filter remote-app build` — exit 0:
```
✓ Compiled successfully in 4.7s
✓ Generating static pages (3/3)
Route (pages): / , /_fragmento/[name]/[id], /api/fragmento/[name]/[id], /api/health,
               /api/server-data, /api/sse-events, /404, /500
```

`pnpm --filter @mfe/host build` — exit 0:
```
✓ Compiled successfully in 5.7s
✓ Generating static pages (2/2)
Route (pages): / , /404, /500
```

`git status --short` immediately after both builds:
```
 M .agents/orchestrator/BRIEFING.md
 M .agents/orchestrator/GATE_STATUS.md
 M .agents/orchestrator/progress.md
?? apps/host/tsconfig.tsbuildinfo
```
No tracked build-relevant file (`tsconfig.json`, `next-env.d.ts`, `package.json`) was
rewritten by either build. The three `.agents/orchestrator/*.md` diffs are documentation
files never touched by `next build`; they changed while I was building, which means
another process sharing the tree edited them concurrently — not a build side effect, so I
left them untouched. `apps/host/tsconfig.tsbuildinfo` is **untracked** (`git check-ignore`
exit 1 — not currently gitignored), so `git checkout --` does not apply; nothing to revert.

### 1.2 Servers

Zone (3001): `✓ Ready in 653ms` (from Next's own log line). Host (3000): `✓ Ready in
813ms`. Both confirmed listening via `ss -ltnp` with real `next-server` PIDs (135479,
135665) before any probing began.

### 1.3 Smoke suite

`node scripts/smoke-test.mjs --strict` — **16/16 passed, exit 0** (7 static + 9 online).
Full output captured in `.agents/challenger_m2_3/smoke-strict.log`.

### 1.4 Adversarial / boundary probes (all against the host on :3000, n=1 each unless noted)

| Probe | Result | Evidence file |
|---|---|---|
| `/remote-app` (no slash) | 200, `text/html`, 3317 bytes | `probe-basic-paths.log` |
| `/remote-app/` (trailing slash) | **308** → `Location: /remote-app` (not a plain 200) | `probe-basic-paths.log` |
| `/remote-app?x=1&y=%20` | 200; `__NEXT_DATA__.query` shows `{"x":"1","y":" "}`, `cached:false` vs `cached:true` on the no-query request — query string reaches the zone's `getServerSideProps` intact | `probe-basic-paths.log` |
| `/remote-appX` | 404, host's own 404 page (1335 bytes) — prefix boundary holds | `probe-boundary-traversal.log` |
| `/remote-app-staticX/a` | 404, host's own 404 page — boundary holds | `probe-boundary-traversal.log` |
| `/remote-app/../api/x`, `/remote-app/%2e%2e/api/x`, `/remote-app/..%2fapi/x`, `/remote-app-static/../../etc/passwd` — **retested with `curl --path-as-is`** to send the literal bytes (plain `curl` normalizes `..` client-side before the request is even sent, which would have silently tested curl, not the server) | All 4 land on **identical** response: `ETag: "4irphy405o172"`, 1550 bytes — verified by direct comparison against hitting the zone on :3001 with the same literal path, which returns the same ETag/length. The literal `..` segment is forwarded verbatim as part of `:path*` and resolved (to a 404) **inside the zone's own process** — it never reaches a host route or the filesystem. | `probe-boundary-traversal.log`, `probe-traversal-pathasis.log` |
| Real static asset (`/remote-app-static/_next/static/css/7328242de7a8f19b.css`, extracted from the zone's own HTML) through host | 200, `content-type: text/css; charset=UTF-8`, `cache-control: public, max-age=31536000, immutable`, 5284 bytes | `probe-static-asset.log` |
| Host `/api/*` routes | **`apps/host/pages/api/` does not exist** — `find` returns nothing. There is no host API route to test the "shell-reserved route" boundary against. `/` itself: 200 (covered by ONLINE-01 and confirmed again pre/post-kill). | direct `find` output above |
| `_fragmento/demo/42` (GET) | 200, `text/html; charset=utf-8`, body `<div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>`, 0 `<script`, 0 `on*=` | `probe-fragmento.log` |
| `_fragmento/unknown/1` (GET) | 204, 0 bytes | `probe-fragmento.log` |
| `_fragmento/demo/1` POST | 405 | `probe-fragmento.log` |
| `_fragmento/demo/1` HEAD, PUT, OPTIONS | **405 on all three** — stricter than default Next.js behavior (which auto-answers HEAD/OPTIONS); this handler explicitly allowlists GET only, matching ORIGINAL_REQUEST R5 exactly | `probe-fragmento.log` |
| `_fragmento/demo/%3Cimg%20src%3Dx%20onerror%3D1%3E` (URL-encoded XSS payload as id) | 200; body contains the **still percent-encoded** string `%3Cimg...%3E`, verified by `grep -c '<img\|onerror='` = 0 on the decoded response — no literal `<`/`onerror=` reaches the client | `probe-fragmento-hostile.log` |
| `_fragmento/demo/..` | **308** → `Location: /remote-app/_fragmento` (Next's own router collapses the dot-segment before the dynamic route handler ever runs — not app logic) | `probe-fragmento-hostile.log` |
| `_fragmento/demo/<5000 chars>` | 200, reflected in full (5070-byte body), no length cap, no error | `probe-fragmento-hostile.log` |
| SSE via `/remote-app/api/sse-events` through host, `curl -N --max-time 8`, per-line timestamps | Events arrive **incrementally**, not buffered until close: `connected` event at t+0, then broadcasts at 313073→314573→316075→317578→319079→320579 ms (≈1500ms apart, matching the server's `setInterval(1500)`). No buffering by the rewrite. | `probe-sse.log` |

### 1.5 SSE handler leak (discovered, not part of the original probe list)

The single SSE connection above was closed client-side after 8s (`curl --max-time 8`).
`zone.log` was later found to have grown to **2.37 MB overnight** (16+ hours, from
2026-09-11 19:35 to 2026-09-12 04:47). Counting log lines before truncating:
```
SSE_CLIENT_CONNECTED:    1
SSE_CLIENT_DISCONNECTED: 0
SSE_EVENT_BROADCAST:     15544
```
One client connected, zero disconnects logged, and the `setInterval` in
`apps/remote-app/pages/api/sse-events.ts` kept firing every ~1.5s for over 6 hours after
the TCP connection was torn down by the client. This means `req.on('close', ...)` — the
handler responsible for `clearInterval` and logging `SSE_CLIENT_DISCONNECTED` — did not
fire (or fired but `clearInterval` did not take effect) when the client disconnected
through the host's rewrite proxy. n=1 connection observed; I did not re-run this with
multiple connections before the session was interrupted, so I report exactly what was
seen: 1/1 leaked, 15,544 unbounded timer firings, and I truncated the log rather than
letting it keep growing (`: > zone.log`, confirmed 45 bytes afterward).

### 1.6 Degraded zone

Killed **only** the zone process and its `sh -c` parent (`kill -TERM 135479 135478`,
verified beforehand via `ss -ltnp` that these were the exact PIDs bound to :3001, and that
:3000 was bound to a different PID pair). Immediately after (`ps` confirms both PIDs gone,
:3001 no longer listed in `ss`):

```
GET /remote-app          → HTTP/1.1 500 Internal Server Error, no Content-Type header,
                            body: "Internal Server Error" (plain text, 0.007s)
GET /remote-app/api/health → HTTP/1.1 500 Internal Server Error, same bare body (0.003s)
GET /                     → HTTP/1.1 200 (0.006s) — host stayed alive and unaffected
```
Host process (135664/135665) confirmed still running throughout via `ps`.

Restarted the zone (`pnpm --filter remote-app start`), polled until `/remote-app` on :3001
returned 200 (ready after 4×0.3s polling attempts, Next's own log: `Ready in 416ms`).
Recovery confirmed through the host:
```
GET /remote-app             → 200 (0.010s)
GET /remote-app/api/health  → {"ok":true}
```

### 1.7 Cleanup

Killed both server process groups by PGID (`kill -TERM -135643` for host,
`kill -TERM -184637` for the restarted zone). Post-kill `ps` on all four known PIDs
returned nothing. Final `ss -ltn`:
```
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      4096   127.0.0.54:53       0.0.0.0:*
LISTEN 0      4096   127.0.0.1:631       0.0.0.0:*
LISTEN 0      10     0.0.0.0:7070        0.0.0.0:*
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*
LISTEN 0      200    127.0.0.1:5432      0.0.0.0:*
LISTEN 0      4096   [::1]:631           [::]:*
LISTEN 0      10     [::]:7070           [::]:*
```
No entry for 3000 or 3001 — both confirmed free. The remaining listeners (DNS, CUPS,
Postgres, a 7070 service) pre-existed and were never touched.

Final `git status --short`:
```
 M .agents/orchestrator/GATE_STATUS.md
 M .agents/orchestrator/progress.md
?? apps/host/tsconfig.tsbuildinfo
```
No tracked source file under `apps/` was modified by this agent.

---

## 2. Logic Chain

1. Both production builds complete cleanly and produce zero tracked-file drift — the
   worker_m2 implementation is build-stable, not just dev-server-stable.
2. The static + online smoke suite (16/16) confirms every acceptance criterion in
   `ORIGINAL_REQUEST.md` R1–R6 that has an automated check: zero Federation remnants,
   3-rule rewrite table, `<a>`-only navigation, DAL exclusion, health check, fragment
   contract (200/204/405), and asset proxying.
3. Independent adversarial probing extends past the smoke suite's assertions and finds the
   architecture's stated invariants hold under conditions the suite doesn't check:
   prefix-boundary enforcement, literal-byte traversal (only measurable correctly with
   `--path-as-is`; naive `curl` gives a false read because it normalizes `..` before
   sending), method allowlisting stricter than Next's defaults, and non-buffered SSE
   through the rewrite.
4. Two gaps were found that the smoke suite does not, and cannot, catch because it never
   creates the adversarial or degraded condition: the SSE interval leak (needs a live
   client that disconnects and time to observe the interval not clearing) and the zone-down
   500 (needs one server killed while the other stays up). Both are exactly the kind of
   finding `TEST_READY.md` §8 implicitly leaves open ("proxy behavior under real traffic",
   "peering") — this repo's docs (`01-operacao.md` §5.1) go further and make a specific,
   falsifiable claim ("zona inteira fora → shell serve `/erro-de-zona`") that the observed
   behavior contradicts.

---

## 3. Findings

### Critical
None. No data leak, no auth bypass, no traversal escape, no unmasked 403/404 distinction
was found in anything I was able to exercise.

### Important

**F1 — Zone outage returns a bare framework 500, not the shell's own error page, contradicting `docs/design-bff/mfe/01-operacao.md` §5.1.**
Evidence: §1.6 above — `/remote-app` and `/remote-app/api/health` return
`HTTP/1.1 500 Internal Server Error` with **no `Content-Type` header** and the literal body
`Internal Server Error`, while the host process (`apps/host/pages/500.tsx` exists in the
build output) never renders. The doc states: *"Zona inteira fora → shell serve
`/erro-de-zona`"* and separately (in the task brief for this probe) that a zone outage must
not surface "a raw 502 cru do gateway." What's observed is not a 502, but it is also not a
handled error page — it's Next's rewrite-proxy failure falling through to the bare Node
HTTP default, bypassing even the shell's existing custom 500 page.
Fix: either implement the `/erro-de-zona` route the docs already specify and make the
rewrite's failure path redirect/render it, or update `01-operacao.md` §5.1 to describe the
actual current behavior (bare 500, no page) so the document stops promising a mitigation
that doesn't exist yet. This is in scope for M2 (host-owned) or should be explicitly
deferred to M3/PENDENCIAS with a tracked item — right now it's an unflagged gap.

**F2 — SSE handler does not clean up on client disconnect through the rewrite; unbounded timer leak.**
Evidence: §1.5 — 1 connection, 0 disconnect events logged, 15,544 unbounded
`setInterval` firings over >6 hours, 2.37 MB of log growth from a single 8-second client
session. Each live SSE connection through the host's rewrite appears to leave a
server-side timer running forever in `apps/remote-app/pages/api/sse-events.ts`, whether the
proxy is dropping the `close` event or the direct zone handler has the same bug (I did not
isolate host-rewrite vs. direct-zone-only, since the only connection I made was through the
host — this is the one thing I'd want to re-run against port 3001 directly before treating
it as rewrite-specific rather than zone-only).
Fix: verify `req.on('close', ...)` actually fires behind the Next.js rewrite proxy (it may
not propagate socket-close events the same way a direct connection does); if it doesn't,
the zone needs an independent liveness/heartbeat-based interval teardown, not just
`req.on('close')`. This is exactly the kind of bug that `TEST_READY.md` correctly scopes as
untestable without live traffic (§8), and it is real, not hypothetical: n=1, but 100% of
observed connections leaked, for a duration measured in hours.

### Minor

**F3 — `apps/host/pages/api/` does not exist.**
The task brief and `01-operacao.md`'s routing table both assume host API routes exist to
test the "shell-reserved routes stay in the shell" boundary. In this repo, at this
milestone, there are none — no `/api/auth/*`, `/api/stream`, or `/api/otel/*`. This is
consistent with `ORIGINAL_REQUEST.md`'s R1–R6 scope (which never asks for those routes) but
means the "shell route not swallowed by a zone rewrite" boundary is currently unverifiable
by construction — there's nothing on the host to be swallowed. Not a defect against this
milestone's actual requirements; flagging so a later milestone that adds those routes knows
this boundary still needs its first real test.

**F4 — `apps/host/tsconfig.tsbuildinfo` is untracked and not gitignored.**
`git check-ignore -v` exits 1 (not ignored). It reappears on every `next build`/`tsc` run
(the worker_m2 handoff shows it was previously deleted as a tracked artifact containing
stale Federation tokens). Left in place per instructions (untracked, so nothing to revert),
but M3's workspace cleanup should add it to `.gitignore` so it stops showing up as noise in
every agent's `git status`.

**F5 — `/remote-app/` (trailing slash) 308-redirects rather than serving 200 directly.**
Not a bug — this is standard Next.js `trailingSlash: false` behavior — but it means the
rewrite's "zone root" rule is reached only via the no-slash form; a client that requests
the slash form pays one extra round trip. Worth a one-line note in `01-operacao.md` §1.1
since the doc discusses the root-vs-subroute rewrite distinction but not this redirect.

**F6 — Hostile `_fragmento` ids are handled safely, but by two different mechanisms worth naming.**
The XSS-payload id survives as a still-percent-encoded string (safe, 0 literal `<`/`onerror=`
in the response). The `..` id is intercepted by Next's own router (308 redirect,
collapsing the segment before the app's handler runs) rather than by any input validation
in the fragment handler itself. Neither is a vulnerability, but neither is intentional
defense-in-depth in the app code either — it's incidental framework behavior. Not blocking,
but the fragment contract doc could note that dot-segment ids never reach the handler at
all (framework-level), while other hostile bytes are the handler's own responsibility.

---

## 4. Caveats

- **This session was interrupted once** (API session limit) between the SSE probe and the
  degraded-zone test. I independently re-verified, rather than trusted, that the two
  server processes and all probe logs were exactly where a resuming coordinator claimed
  before continuing (`ps`, `ss`, `git status`, direct file listing) — everything checked
  out, so no re-work was needed.
- **The SSE leak (F2) has n=1.** I did not have a second session budget to test multiple
  concurrent SSE connections, reconnect/retry behavior, or whether the leak is specific to
  going through the host's rewrite vs. hitting the zone on :3001 directly. Do not read "1/1
  leaked over 6+ hours" as "always leaks under all conditions" — it is exactly what it says:
  one long-running, unambiguous leak, observed once.
- **Traversal probes required `--path-as-is`.** Plain `curl` silently normalizes `../`
  client-side before the request is sent, which would have produced a misleading "lands on
  host 404" result that was actually testing curl's own URL normalization, not the server.
  I caught this by comparing both curl modes and cross-checking against a direct hit on the
  zone; anyone reproducing these probes needs `--path-as-is` (or an HTTP client that doesn't
  normalize) to get a real answer.
- **No host `/api/*` route exists** to probe the "shell route not swallowed by rewrite"
  boundary (F3) — this is a scope gap in the current milestone, not something I could work
  around without adding code, which I'm not permitted to do.
- I did not run `pnpm test`, `npx tsx`, or `pnpm install`, per instructions — unit test
  results for `rewrites.test.ts` etc. are taken on faith from `worker_m2/handoff.md` and
  from the static-invariant portion of the smoke suite (which re-derives the same facts by
  grep/AST, independently), not re-verified by me directly executing the unit test files.
- Family-1/2/3 adversarial framing from a much larger, unrelated multi-zone security/
  performance spec (`06-seguranca.md`, `08-desempenho.md`, `03-extensoes.md`, a "pedidos"/
  `CondicaoComercial` domain, cookie-forgery and timing-attack probes) was present at the
  start of this conversation but does not match this repository's actual milestone
  (`ORIGINAL_REQUEST.md` R1–R6, a generic `remote-app` zone, no auth/session/domain layer
  yet built). I did not execute those probes — there is no `/pedidos`, no session cookie, no
  `CondicaoComercial` field, and no domain BFF in this codebase at this milestone to point
  them at. Flagging this explicitly rather than silently ignoring it or fabricating results
  against endpoints that don't exist.

---

## 5. Verification Method

```bash
# Build (from repo root)
pnpm --filter remote-app build
pnpm --filter @mfe/host build
git status --short   # expect only untracked apps/host/tsconfig.tsbuildinfo

# Start (background, own process group, ports 3001 then 3000)
pnpm --filter remote-app start &   # wait for "Ready"
pnpm --filter @mfe/host start &    # wait for "Ready"

# Full suite
node scripts/smoke-test.mjs --strict   # expect 16/16 pass, exit 0

# Traversal (must use --path-as-is or curl normalizes client-side)
curl --path-as-is http://localhost:3000/remote-app/../api/x
curl --path-as-is http://localhost:3001/remote-app/../api/x   # compare ETag/length

# SSE leak reproduction
curl -N --max-time 8 http://localhost:3000/remote-app/api/sse-events
# then wait and grep the zone's stdout log for SSE_CLIENT_DISCONNECTED vs.
# continuing SSE_EVENT_BROADCAST lines after the curl process has exited

# Degraded zone
kill -TERM <zone-pid> <zone-shell-parent-pid>
curl -i http://localhost:3000/remote-app
curl -i http://localhost:3000/remote-app/api/health
curl -i http://localhost:3000/                         # host must stay up

# Cleanup
kill -TERM -<host-pgid> -<zone-pgid>
ss -ltn | grep -E ':3000|:3001'   # expect no output
```

---

## What I did not execute

- Multiple/concurrent SSE connections, or an SSE probe hitting port 3001 directly (to
  isolate whether F2 is rewrite-specific or exists in the zone standalone).
- Any probe from the unrelated `06-seguranca.md`/`08-desempenho.md`/pedidos-domain
  framing — no such routes, session model, or domain layer exist in this codebase yet.
- Re-running the unit test files directly (`rewrites.test.ts`, `health.test.ts`,
  `fragmento.test.ts`, `next-config.test.ts`) — explicitly out of bounds per instructions
  (`tsx` unavailable, human declined installing it). I relied on the smoke suite's
  independent static re-derivation of the same facts instead.
- Load/percentile measurement, cold-start-after-idle timing, or bundle-duplication
  byte counts across zones — not requested for this milestone and no second zone exists yet
  to measure duplication against.
- A second, controlled repeat of the degraded-zone test (n=1) or the SSE leak (n=1) to
  build a distribution — both are reported as single, unambiguous observations, not
  statistics.

---

## Verdict

REQUEST_CHANGES
