import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
}

interface NextConfigProperties {
  readonly basePath?: string | undefined;
  readonly assetPrefix?: string | undefined;
  readonly reactStrictMode?: boolean | null | undefined;
  readonly rewrites?: (() => Promise<RewriteRule[] | { beforeFiles?: RewriteRule[]; afterFiles?: RewriteRule[]; fallback?: RewriteRule[] }>) | undefined;
  readonly default?: NextConfigProperties | undefined;
}

const rawConfig: NextConfigProperties = nextConfig;
const config: NextConfigProperties = rawConfig.default ?? rawConfig;

test('basePath is configured as /remote-app for Multi-Zones routing', () => {
  assert.equal(config.basePath, '/remote-app');
});

test('assetPrefix is configured as /remote-app-static to avoid /_next collisions', () => {
  assert.equal(config.assetPrefix, '/remote-app-static');
});

test('reactStrictMode is true', () => {
  assert.equal(config.reactStrictMode, true);
});

test('internal rewrites configure _fragmento route', async () => {
  assert.equal(typeof config.rewrites, 'function');
  const rewritesResult = await config.rewrites!();
  const list: readonly RewriteRule[] = Array.isArray(rewritesResult)
    ? rewritesResult
    : (rewritesResult.afterFiles ?? rewritesResult.beforeFiles ?? []);
  const fragmentRewrite = list.find((rule: RewriteRule) => rule.source === '/_fragmento/:name/:id');
  assert.ok(fragmentRewrite, 'Must contain rewrite for /_fragmento/:name/:id');
  assert.equal(fragmentRewrite?.destination, '/api/fragmento/:name/:id?name=:name&id=:id');
});
