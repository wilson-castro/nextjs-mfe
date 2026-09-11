/**
 * @file online-smoke.mjs
 * Executes live HTTP smoke tests against the host shell (port 3000) and remote zone (port 3001).
 */

import {
  ANSI,
  recordTestResult,
  httpFetch,
  assertStatusCode,
  assertContains,
  assertNotRegex,
} from './test-helpers.mjs';

const HOST_BASE_URL = process.env.HOST_URL ?? 'http://localhost:3000';
const ZONE_BASE_URL = process.env.ZONE_URL ?? 'http://localhost:3001';

/**
 * Checks Shell Home Page (GET /).
 */
async function testHostShellHome() {
  const url = `${HOST_BASE_URL}/`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Host Shell Home');

  const hasDiagnostics =
    res.body.includes('Shell Runtime Diagnostics') ||
    res.body.includes('SSR Rendered at:') ||
    res.body.includes('hostRenderTimestamp');

  if (!hasDiagnostics) {
    throw new Error('Host Shell Home does not contain expected runtime diagnostics markup');
  }

  assertContains(res.body, 'href="/remote-app"', 'Host Shell Home cross-zone link');
  assertNotRegex(res.body, /remoteEntry\.js/i, 'Host Shell Home bundle scripts');
}

/**
 * Checks Zone Index via Shell Rewrite (GET /remote-app).
 */
async function testZoneIndexViaShellRewrite() {
  const url = `${HOST_BASE_URL}/remote-app`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Zone Index via Shell Rewrite');

  const isZoneRendered =
    res.body.includes('remote-app') ||
    res.body.includes('Remote App') ||
    res.body.includes('Remote Dashboard');

  if (!isZoneRendered) {
    throw new Error('Response body does not contain expected remote zone index content');
  }
}

/**
 * Checks Zone Health Check Endpoint via Shell (GET /remote-app/api/health).
 */
async function testZoneHealthViaShell() {
  const url = `${HOST_BASE_URL}/remote-app/api/health`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Health via Shell');

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected application/json content-type, received ${contentType}`);
  }

  const data = JSON.parse(res.body);
  if (data.ok !== true) {
    throw new Error(`Expected { ok: true }, received ${JSON.stringify(data)}`);
  }
}

/**
 * Checks Direct Health Check Endpoint (GET http://localhost:3001/remote-app/api/health).
 */
async function testZoneHealthDirect() {
  const url = `${ZONE_BASE_URL}/remote-app/api/health`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Health Direct (port 3001)');

  const data = JSON.parse(res.body);
  if (data.ok !== true) {
    throw new Error(`Expected { ok: true }, received ${JSON.stringify(data)}`);
  }
}

/**
 * Checks Valid Fragment via Shell (GET /remote-app/_fragmento/demo/42).
 */
async function testFragmentDemoViaShell() {
  const url = `${HOST_BASE_URL}/remote-app/_fragmento/demo/42`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Fragment Demo via Shell');

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Expected text/html content-type, received ${contentType}`);
  }

  assertContains(res.body, 'Demo fragment (id: 42)', 'Fragment Demo HTML body');
  assertNotRegex(res.body, /<script\b/i, 'Fragment Demo HTML inertness (<script>)');
  assertNotRegex(res.body, /on[a-z]+=/i, 'Fragment Demo HTML inline handlers');
}

/**
 * Checks Direct Fragment Endpoint (GET http://localhost:3001/remote-app/_fragmento/demo/42).
 */
async function testFragmentDemoDirect() {
  const url = `${ZONE_BASE_URL}/remote-app/_fragmento/demo/42`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 200, 'Fragment Demo Direct (port 3001)');
  assertContains(res.body, 'Demo fragment (id: 42)', 'Direct fragment body');
  assertNotRegex(res.body, /<script\b/i, 'Direct fragment inertness');
}

/**
 * Checks Unknown / Unauthorized Fragment returns 204 No Content.
 */
async function testFragmentUnknownReturns204() {
  const url = `${HOST_BASE_URL}/remote-app/_fragmento/unknown/1`;
  const res = await httpFetch(url);
  assertStatusCode(res.status, 204, 'Unknown Fragment via Shell');

  if (res.body.length > 0) {
    throw new Error(`Expected 0-byte body for 204, received ${res.body.length} bytes`);
  }
}

/**
 * Checks Method Not Allowed on Fragment (POST returns 405).
 */
async function testFragmentPostReturns405() {
  const url = `${HOST_BASE_URL}/remote-app/_fragmento/demo/1`;
  const res = await httpFetch(url, { method: 'POST' });
  assertStatusCode(res.status, 405, 'POST Fragment via Shell');
}

/**
 * Checks Static Asset Proxying (/remote-app-static/_next/...).
 */
async function testStaticAssetProxying() {
  const url = `${HOST_BASE_URL}/remote-app-static/test-asset-probe`;
  const res = await httpFetch(url);
  // Next.js responds with 404 from the zone server or 200/304 if asset exists.
  // Critical invariant: must NOT return 500 or crash the host shell.
  if (res.status >= 500) {
    throw new Error(`Static asset proxying failed with server error HTTP ${res.status}`);
  }
}

/**
 * Executes all online smoke test checks.
 * @param {object} initialReport
 * @returns {Promise<object>} updated test report
 */
export async function runOnlineSmokeChecks(initialReport) {
  let report = initialReport;

  const testDefinitions = [
    { id: 'ONLINE-01', desc: 'Host Shell Home (GET /) returns 200 with diagnostics & link', fn: testHostShellHome },
    { id: 'ONLINE-02', desc: 'Zone Index via Shell Rewrite (GET /remote-app) returns 200', fn: testZoneIndexViaShellRewrite },
    { id: 'ONLINE-03', desc: 'Zone Health via Shell (GET /remote-app/api/health) returns {"ok":true}', fn: testZoneHealthViaShell },
    { id: 'ONLINE-04', desc: 'Zone Health Direct on port 3001 returns {"ok":true}', fn: testZoneHealthDirect },
    { id: 'ONLINE-05', desc: 'Fragment Demo via Shell returns 200, text/html, inert body', fn: testFragmentDemoViaShell },
    { id: 'ONLINE-06', desc: 'Fragment Demo Direct on port 3001 returns 200 inert HTML', fn: testFragmentDemoDirect },
    { id: 'ONLINE-07', desc: 'Fragment Unknown via Shell returns 204 No Content', fn: testFragmentUnknownReturns204 },
    { id: 'ONLINE-08', desc: 'Fragment POST returns 405 Method Not Allowed', fn: testFragmentPostReturns405 },
    { id: 'ONLINE-09', desc: 'Static asset proxying (/remote-app-static/**) resolves without 5xx', fn: testStaticAssetProxying },
  ];

  console.log(`\n${ANSI.cyan}${ANSI.bold}--- Tier 1/2/3 Online Smoke Checks ---${ANSI.reset}`);

  for (const test of testDefinitions) {
    try {
      await test.fn();
      console.log(`  ${ANSI.green}✓ PASS${ANSI.reset} [${test.id}] ${test.desc}`);
      report = recordTestResult(report, { id: test.id, description: test.desc, passed: true });
    } catch (err) {
      console.log(`  ${ANSI.red}✗ FAIL${ANSI.reset} [${test.id}] ${test.desc}`);
      console.log(`    ${ANSI.gray}Error: ${err.message}${ANSI.reset}`);
      report = recordTestResult(report, { id: test.id, description: test.desc, passed: false, error: err.message });
    }
  }

  return report;
}
