import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
}

interface RewritesResultObject {
  readonly beforeFiles?: readonly RewriteRule[] | undefined;
  readonly afterFiles?: readonly RewriteRule[] | undefined;
  readonly fallback?: readonly RewriteRule[] | undefined;
}

type RewritesExport = () => Promise<readonly RewriteRule[] | RewritesResultObject>;

interface NextConfigModule {
  readonly reactStrictMode?: boolean | null | undefined;
  readonly rewrites?: RewritesExport | undefined;
  readonly default?: NextConfigModule | undefined;
}

const rawConfig: NextConfigModule = nextConfig as unknown as NextConfigModule;
const config: NextConfigModule = rawConfig.default ?? rawConfig;

function isRewriteRuleArray(
  value: readonly RewriteRule[] | RewritesResultObject
): value is readonly RewriteRule[] {
  return Array.isArray(value);
}

function extractRewriteRules(
  result: readonly RewriteRule[] | RewritesResultObject
): readonly RewriteRule[] {
  if (isRewriteRuleArray(result)) {
    return result;
  }
  return result.afterFiles ?? result.beforeFiles ?? [];
}

test('reactStrictMode is enabled in host next.config.js', () => {
  // Assert
  assert.equal(config.reactStrictMode, true);
});

test('next.config.js exports rewrites as an async function', () => {
  // Assert
  assert.equal(typeof config.rewrites, 'function', 'config.rewrites must be a function');
});

test('rewrites returns an array containing exactly 3 rewrite rules', async () => {
  // Arrange
  assert.ok(config.rewrites, 'rewrites function must exist');

  // Act
  const result = await config.rewrites();
  const rules = extractRewriteRules(result);

  // Assert
  assert.equal(rules.length, 3, `Expected exactly 3 rewrite rules, received ${rules.length}`);
});

test('rewrites contains the 3 required Multi-Zones routing rules', async () => {
  // Arrange
  assert.ok(config.rewrites, 'rewrites function must exist');

  // Act
  const result = await config.rewrites();
  const rules = extractRewriteRules(result);

  const rootRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app');
  const subRouteRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app/:path*');
  const staticRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app-static/:path*');

  // Assert
  assert.ok(rootRule, 'Missing rewrite rule for source "/remote-app"');
  assert.equal(rootRule.destination, 'http://localhost:3001/remote-app');

  assert.ok(subRouteRule, 'Missing rewrite rule for source "/remote-app/:path*"');
  assert.equal(subRouteRule.destination, 'http://localhost:3001/remote-app/:path*');

  assert.ok(staticRule, 'Missing rewrite rule for source "/remote-app-static/:path*"');
  assert.equal(staticRule.destination, 'http://localhost:3001/remote-app-static/:path*');
});

test('rewrites dynamically respects REMOTE_ZONE_URL environment variable override', async () => {
  // Arrange
  const originalZoneUrl = process.env.REMOTE_ZONE_URL;
  const originalAppUrl = process.env.REMOTE_APP_URL;
  delete process.env.REMOTE_APP_URL;
  process.env.REMOTE_ZONE_URL = 'http://custom-zone:9999';

  try {
    // Act
    assert.ok(config.rewrites, 'rewrites function must exist');
    const result = await config.rewrites();
    const rules = extractRewriteRules(result);

    const rootRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app');
    const subRouteRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app/:path*');
    const staticRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app-static/:path*');

    // Assert
    assert.equal(rootRule?.destination, 'http://custom-zone:9999/remote-app');
    assert.equal(subRouteRule?.destination, 'http://custom-zone:9999/remote-app/:path*');
    assert.equal(staticRule?.destination, 'http://custom-zone:9999/remote-app-static/:path*');
  } finally {
    if (originalZoneUrl !== undefined) {
      process.env.REMOTE_ZONE_URL = originalZoneUrl;
    } else {
      delete process.env.REMOTE_ZONE_URL;
    }
    if (originalAppUrl !== undefined) {
      process.env.REMOTE_APP_URL = originalAppUrl;
    }
  }
});

test('rewrites dynamically respects REMOTE_APP_URL fallback environment variable', async () => {
  // Arrange
  const originalZoneUrl = process.env.REMOTE_ZONE_URL;
  const originalAppUrl = process.env.REMOTE_APP_URL;
  delete process.env.REMOTE_ZONE_URL;
  process.env.REMOTE_APP_URL = 'http://custom-app:8888';

  try {
    // Act
    assert.ok(config.rewrites, 'rewrites function must exist');
    const result = await config.rewrites();
    const rules = extractRewriteRules(result);

    const rootRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app');
    const subRouteRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app/:path*');
    const staticRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app-static/:path*');

    // Assert
    assert.equal(rootRule?.destination, 'http://custom-app:8888/remote-app');
    assert.equal(subRouteRule?.destination, 'http://custom-app:8888/remote-app/:path*');
    assert.equal(staticRule?.destination, 'http://custom-app:8888/remote-app-static/:path*');
  } finally {
    if (originalZoneUrl !== undefined) {
      process.env.REMOTE_ZONE_URL = originalZoneUrl;
    }
    if (originalAppUrl !== undefined) {
      process.env.REMOTE_APP_URL = originalAppUrl;
    } else {
      delete process.env.REMOTE_APP_URL;
    }
  }
});
