import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createZoneLivenessCache,
  createFetchProbe,
} from '../lib/zoneLiveness.ts';

/**
 * These tests target the pure decision logic behind the F1 remediation:
 * a short-TTL cached liveness probe that middleware.ts consults to decide
 * whether to let a request through to the zone rewrite, or short-circuit
 * with the shell's own /erro-de-zona response.
 *
 * The cache is deliberately framework-agnostic (no next/server import) so
 * it can run under plain `node --test` without touching Next's request
 * pipeline.
 */

function createManualClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

test('isHealthy() calls the probe exactly once for repeated calls inside the TTL window', async () => {
  const clock = createManualClock();
  let probeCalls = 0;
  const cache = createZoneLivenessCache({
    probe: async () => {
      probeCalls += 1;
      return true;
    },
    ttlMs: 3000,
    now: clock.now,
  });

  await cache.isHealthy();
  clock.advance(1000);
  await cache.isHealthy();
  clock.advance(1000);
  await cache.isHealthy();

  assert.equal(probeCalls, 1, 'probe should be cached within the TTL window');
});

test('isHealthy() re-probes once the TTL window has elapsed', async () => {
  const clock = createManualClock();
  let probeCalls = 0;
  const cache = createZoneLivenessCache({
    probe: async () => {
      probeCalls += 1;
      return true;
    },
    ttlMs: 3000,
    now: clock.now,
  });

  await cache.isHealthy();
  clock.advance(3001);
  await cache.isHealthy();

  assert.equal(probeCalls, 2, 'probe should re-run once the cached value is older than ttlMs');
});

test('isHealthy() reflects a transition from healthy to unhealthy after the TTL expires', async () => {
  const clock = createManualClock();
  let healthy = true;
  const cache = createZoneLivenessCache({
    probe: async () => healthy,
    ttlMs: 1000,
    now: clock.now,
  });

  assert.equal(await cache.isHealthy(), true);

  healthy = false;
  clock.advance(1001);

  assert.equal(await cache.isHealthy(), false, 'cache must reflect the zone going down after TTL expiry');
});

test('isHealthy() de-duplicates concurrent probes in flight (no probe stampede)', async () => {
  const clock = createManualClock();
  let probeCalls = 0;
  let resolveProbe: (value: boolean) => void = () => {};
  const pending = new Promise<boolean>((resolve) => {
    resolveProbe = resolve;
  });

  const cache = createZoneLivenessCache({
    probe: async () => {
      probeCalls += 1;
      return pending;
    },
    ttlMs: 3000,
    now: clock.now,
  });

  const call1 = cache.isHealthy();
  const call2 = cache.isHealthy();
  const call3 = cache.isHealthy();

  resolveProbe(true);
  const results = await Promise.all([call1, call2, call3]);

  assert.equal(probeCalls, 1, 'concurrent callers must share a single in-flight probe');
  assert.deepEqual(results, [true, true, true]);
});

test('createFetchProbe() returns true when the health endpoint responds ok', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

  try {
    const probe = createFetchProbe('http://localhost:3001/remote-app/api/health', 500);
    assert.equal(await probe(), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createFetchProbe() returns false when fetch rejects (connection refused)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;

  try {
    const probe = createFetchProbe('http://localhost:3001/remote-app/api/health', 500);
    assert.equal(await probe(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createFetchProbe() returns false when the health endpoint responds with a non-2xx status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;

  try {
    const probe = createFetchProbe('http://localhost:3001/remote-app/api/health', 500);
    assert.equal(await probe(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createFetchProbe() aborts and returns false when the probe exceeds its timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        reject(new Error('The operation was aborted'));
      });
    });
  }) as typeof fetch;

  try {
    const probe = createFetchProbe('http://localhost:3001/remote-app/api/health', 20);
    const result = await probe();
    assert.equal(result, false, 'a hung probe must resolve false once the timeout fires, not hang forever');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
