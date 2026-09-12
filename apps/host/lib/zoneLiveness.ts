/**
 * Short-TTL cached liveness probe for a Multi-Zones remote zone.
 *
 * Why this exists (F1 remediation): Next.js `rewrites()` has no
 * upstream-failure hook -- the proxy error happens before any shell code
 * runs, so a dead zone falls straight through to a bare Node HTTP 500 with
 * no Content-Type, bypassing even the shell's own `pages/500.tsx`. The fix
 * is `middleware.ts`, which runs *before* the rewrite is dispatched and can
 * short-circuit the request. This module is the framework-agnostic decision
 * logic middleware.ts consults to decide whether to let the request through.
 *
 * Deliberately kept free of any `next/server` import so it can be exercised
 * directly under plain `node --test`, without Next's request runtime.
 */

export interface ZoneLivenessCache {
  /** Resolves to whether the zone should be treated as reachable right now. */
  isHealthy(): Promise<boolean>;
}

export interface ZoneLivenessCacheOptions {
  /** Performs one liveness check against the zone. Never expected to throw. */
  readonly probe: () => Promise<boolean>;
  /** How long a probe result is trusted before a fresh probe is required. */
  readonly ttlMs: number;
  /** Injectable clock for tests; defaults to Date.now. */
  readonly now?: () => number;
}

interface CachedResult {
  readonly healthy: boolean;
  readonly checkedAt: number;
}

/**
 * Builds a TTL-cached liveness cache around an arbitrary probe function.
 *
 * Cost/staleness trade-off (documented per the task's explicit ask to weigh
 * it): within the TTL window, `isHealthy()` is a plain memory read -- zero
 * network cost per request. Concurrent callers during a cache miss share a
 * single in-flight probe (no stampede). The trade-off this buys is
 * staleness: a zone that goes down is only detected on the *next* probe, so
 * up to `ttlMs` worth of requests immediately after an outage begins can
 * still be dispatched to the (now dead) zone before the cache catches up.
 * See middleware.ts and the F1 handoff for why this window was accepted
 * rather than probing on every request.
 */
export function createZoneLivenessCache(options: ZoneLivenessCacheOptions): ZoneLivenessCache {
  const { probe, ttlMs } = options;
  const now = options.now ?? Date.now;

  let cached: CachedResult | null = null;
  let inFlight: Promise<boolean> | null = null;

  function refresh(): Promise<boolean> {
    if (inFlight) {
      return inFlight;
    }

    const probePromise = probe()
      .then((healthy) => {
        cached = { healthy, checkedAt: now() };
        return healthy;
      })
      .finally(() => {
        inFlight = null;
      });

    inFlight = probePromise;
    return probePromise;
  }

  return {
    isHealthy(): Promise<boolean> {
      if (cached && now() - cached.checkedAt < ttlMs) {
        return Promise.resolve(cached.healthy);
      }
      return refresh();
    },
  };
}

const DEFAULT_TTL_MS = 3000;
const DEFAULT_PROBE_TIMEOUT_MS = 800;

/**
 * Builds a probe function that hits a zone's own `/api/health` endpoint
 * (F8 -- process liveness only, never the domain) with a hard timeout.
 * Any failure -- connection refused, non-2xx, or timeout -- is treated as
 * "not healthy"; this probe never throws.
 */
export function createFetchProbe(
  healthUrl: string,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): () => Promise<boolean> {
  return async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

let sharedCache: ZoneLivenessCache | null = null;

/**
 * Lazily builds (once per process) the liveness cache middleware.ts uses,
 * pointed at the same zone origin the rewrite rules in next.config.js use.
 */
export function getSharedZoneLivenessCache(): ZoneLivenessCache {
  if (!sharedCache) {
    const remoteZoneUrl =
      process.env.REMOTE_ZONE_URL || process.env.REMOTE_APP_URL || 'http://localhost:3001';
    const healthUrl = `${remoteZoneUrl}/remote-app/api/health`;
    sharedCache = createZoneLivenessCache({
      probe: createFetchProbe(healthUrl),
      ttlMs: DEFAULT_TTL_MS,
    });
  }
  return sharedCache;
}

/** Test-only escape hatch to reset the process-wide singleton. */
export function __resetSharedZoneLivenessCacheForTests(): void {
  sharedCache = null;
}
