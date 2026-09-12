import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSharedZoneLivenessCache } from './lib/zoneLiveness';
import { renderZoneErrorHtml } from './lib/zoneErrorPage';

/**
 * F1 remediation -- see .agents/worker_m2_fix/handoff.md for the full
 * decision write-up.
 *
 * The problem: `apps/host/next.config.js`'s `rewrites()` proxies
 * `/remote-app`, `/remote-app/:path*` and `/remote-app-static/:path*` to the
 * zone on :3001. Next.js has no hook for "the upstream of a rewrite failed
 * to connect" -- the proxy error is raised by Next's internal server before
 * any shell code (not even `pages/500.tsx`) gets a chance to run, so a dead
 * zone surfaces as a bare `HTTP/1.1 500 Internal Server Error` with no
 * Content-Type. docs/design-bff/mfe/01-operacao.md §5.1 promises
 * "Zona inteira fora -> shell serve `/erro-de-zona`" instead.
 *
 * The fix: middleware runs *before* Next dispatches to the rewrite target,
 * so it is the only place in this stack that can intercept the request
 * ahead of the proxy call. It consults a short-TTL cached liveness probe
 * (lib/zoneLiveness.ts) of the zone's own `/api/health` (F8 -- process
 * liveness, zero domain I/O) and, when the zone is down, answers directly
 * with the shell's own outage page instead of letting the request reach the
 * rewrite at all.
 *
 * Alternatives considered and rejected:
 *  - A shell-owned proxy API route that fetches upstream itself and falls
 *    back on a connection error. Rejected: it would have to reimplement
 *    streaming/method/header passthrough that `rewrites()` already gets for
 *    free from Next (this is exactly how SSE-through-the-rewrite already
 *    works today, per the challenger's probe), and it would run that
 *    reimplementation on *every* request, healthy or not -- full
 *    per-request cost forever, not just during an outage.
 *  - Probing the zone on every single request, no cache. Rejected on cost:
 *    it would add one extra network round-trip to every zone request even
 *    while healthy, which is the common case by far.
 *  - No caching TTL at all (probe once at server boot, trust it forever).
 *    Rejected on staleness: an outage starting after boot would never be
 *    detected.
 * The short-TTL cache is the accepted middle ground: near-zero cost per
 * request while healthy (a cache hit is a memory read), and detection
 * latency bounded by the TTL (see lib/zoneLiveness.ts) while unhealthy.
 *
 * Status code: 503 Service Unavailable with `Retry-After`, not the bare 500
 * this fix replaces. 503 is the conventional code for "a dependency is
 * currently down, try again" (docs/design-bff/comum/docs/PENDENCIAS.md uses
 * the same convention for its own overload-shedding case); a bare 500 with
 * no further information is exactly the defect being fixed here.
 */

export const config = {
  matcher: ['/remote-app', '/remote-app/:path*', '/remote-app-static/:path*'],
};

const OUTAGE_RETRY_AFTER_SECONDS = '5';

export async function middleware(_request: NextRequest): Promise<NextResponse> {
  const liveness = getSharedZoneLivenessCache();
  const isZoneHealthy = await liveness.isHealthy();

  if (isZoneHealthy) {
    return NextResponse.next();
  }

  return new NextResponse(renderZoneErrorHtml(), {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': OUTAGE_RETRY_AFTER_SECONDS,
      'cache-control': 'no-store',
    },
  });
}
