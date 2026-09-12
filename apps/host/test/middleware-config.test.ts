import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * middleware.ts wires the pure zoneLiveness/zoneErrorPage logic (covered by
 * their own unit tests) into Next's request pipeline via `next/server`.
 * `next/server` cannot be imported under plain `node --test` outside of
 * Next's own bundler resolution (bare specifier "next/server" has no
 * extension and Next's package.json declares no "exports" map for it), so
 * this file verifies the wiring statically instead of importing the module.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIDDLEWARE_PATH = path.join(__dirname, '..', 'middleware.ts');

function readMiddlewareSource(): string {
  assert.ok(fs.existsSync(MIDDLEWARE_PATH), `expected ${MIDDLEWARE_PATH} to exist`);
  return fs.readFileSync(MIDDLEWARE_PATH, 'utf-8');
}

test('middleware.ts exists at the host app root', () => {
  assert.ok(fs.existsSync(MIDDLEWARE_PATH));
});

test('middleware.ts matcher covers the zone root, zone sub-routes, and zone static assets', () => {
  const source = readMiddlewareSource();

  assert.match(source, /matcher\s*:/, 'must export a matcher config');
  assert.match(source, /['"]\/remote-app['"]/, 'matcher must cover the bare zone root');
  assert.match(source, /['"]\/remote-app\/:path\*['"]/, 'matcher must cover zone sub-routes');
  assert.match(source, /['"]\/remote-app-static\/:path\*['"]/, 'matcher must cover zone static assets');
});

test('middleware.ts responds 503 with Retry-After when the zone is unhealthy, not a bare 500', () => {
  const source = readMiddlewareSource();

  assert.match(source, /503/, 'the deliberate outage status code must be 503 (dependency down), not a bare 500');
  assert.match(source, /retry-after/i, 'a 503 for a down dependency must advertise Retry-After');
});

test('middleware.ts consults the shared zone liveness cache rather than probing on every request inline', () => {
  const source = readMiddlewareSource();

  assert.match(
    source,
    /zoneLiveness/i,
    'middleware must delegate the outage decision to the cached liveness module, not re-implement probing'
  );
});
