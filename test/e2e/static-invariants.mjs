/**
 * @file static-invariants.mjs
 * Validates offline architectural invariants across configurations and source files.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ANSI,
  recordTestResult,
  assertContains,
  assertNotRegex,
} from './test-helpers.mjs';

const PROJECT_ROOT = process.cwd();

/**
 * Reads file content safely or returns empty string if not found.
 * @param {string} relativePath
 * @returns {string}
 */
function readFileSafe(relativePath) {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return '';
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Checks for banned federation tokens in apps/ source files.
 * @param {string} dir
 * @param {Array<string>} bannedPatterns
 * @returns {Array<{ file: string, match: string }>}
 */
function scanForBannedTokens(dir, bannedPatterns) {
  const violations = [];
  if (!fs.existsSync(dir)) return violations;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next') continue;

    if (entry.isDirectory()) {
      violations.push(...scanForBannedTokens(fullPath, bannedPatterns));
    } else if (/\.(js|jsx|ts|tsx|json|yaml|yml)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const pattern of bannedPatterns) {
        if (content.includes(pattern)) {
          violations.push({ file: path.relative(PROJECT_ROOT, fullPath), match: pattern });
        }
      }
    }
  }
  return violations;
}

/**
 * Verifies zero Module Federation references in application code.
 */
function testZeroFederationReferences() {
  const appsDir = path.join(PROJECT_ROOT, 'apps');
  const bannedPatterns = [
    '@module-federation',
    'remoteEntry',
    'NextFederationPlugin',
    'remote/ServerCard',
    'remote/RemoteDashboard',
  ];
  const violations = scanForBannedTokens(appsDir, bannedPatterns);

  if (violations.length > 0) {
    const summary = violations.map((v) => `${v.file} (contains "${v.match}")`).join(', ');
    throw new Error(`Found ${violations.length} federation remnants: ${summary}`);
  }
}

/**
 * Verifies exactOptionalPropertyTypes: true in remote-app tsconfig.
 */
function testExactOptionalPropertyTypes() {
  const tsconfigPath = fs.existsSync(path.join(PROJECT_ROOT, 'apps/remote-app/tsconfig.json'))
    ? 'apps/remote-app/tsconfig.json'
    : 'apps/remote/tsconfig.json';

  const content = readFileSafe(tsconfigPath);
  if (!content) {
    throw new Error(`tsconfig not found at ${tsconfigPath}`);
  }

  const parsed = JSON.parse(content);
  const isExact = parsed.compilerOptions?.exactOptionalPropertyTypes === true;
  if (!isExact) {
    throw new Error(
      `${tsconfigPath}: compilerOptions.exactOptionalPropertyTypes must be true, received ${parsed.compilerOptions?.exactOptionalPropertyTypes}`
    );
  }
}

/**
 * Verifies cross-zone navigation uses plain <a> and never <Link>.
 */
function testPlainHtmlNavigation() {
  const hostIndex = readFileSafe('apps/host/pages/index.tsx');
  const sideNav = readFileSafe('apps/host/components/SideNavigation.tsx');

  assertContains(hostIndex, 'href="/remote-app"', 'apps/host/pages/index.tsx');
  assertNotRegex(hostIndex, /<Link[^>]*href=["']\/remote-app/i, 'apps/host/pages/index.tsx');

  if (sideNav) {
    assertContains(sideNav, 'href="/remote-app"', 'apps/host/components/SideNavigation.tsx');
    assertNotRegex(sideNav, /<Link[^>]*href=["']\/remote-app/i, 'apps/host/components/SideNavigation.tsx');
  }
}

/**
 * Verifies shell has no Domain Access Layer (DAL) or database dependencies.
 */
function testShellDalExclusion() {
  const hostPkg = readFileSafe('apps/host/package.json');
  const bannedPackages = ['@prisma/client', 'prisma', 'typeorm', 'knex', 'pg', 'mysql2'];

  for (const pkg of bannedPackages) {
    if (hostPkg.includes(`"${pkg}"`)) {
      throw new Error(`apps/host/package.json contains banned DAL package: "${pkg}"`);
    }
  }

  const hostIndex = readFileSafe('apps/host/pages/index.tsx');
  assertNotRegex(hostIndex, /import.*from.*['"](\.\/|\.\.\/)*dal/i, 'apps/host/pages/index.tsx');
}

/**
 * Verifies zone renaming to apps/remote-app.
 */
function testZoneRenameIntegrity() {
  const remoteAppDir = path.join(PROJECT_ROOT, 'apps/remote-app');
  if (!fs.existsSync(remoteAppDir)) {
    throw new Error('Directory apps/remote-app does not exist yet (expected renamed from apps/remote)');
  }

  const pkgContent = readFileSafe('apps/remote-app/package.json');
  if (!pkgContent) {
    throw new Error('apps/remote-app/package.json missing');
  }

  const pkg = JSON.parse(pkgContent);
  const isValidName = pkg.name === 'remote-app' || pkg.name === '@mfe/remote-app';
  if (!isValidName) {
    throw new Error(`apps/remote-app/package.json name expected "remote-app" or "@mfe/remote-app", found "${pkg.name}"`);
  }
}

/**
 * Verifies apps/host rewrites configuration structure.
 */
function testHostRewritesConfig() {
  const hostConfig = readFileSafe('apps/host/next.config.js');
  if (!hostConfig.includes('rewrites')) {
    throw new Error('apps/host/next.config.js does not export async rewrites()');
  }

  assertContains(hostConfig, '/remote-app', 'apps/host/next.config.js rewrites root');
  assertContains(hostConfig, '/remote-app/:path*', 'apps/host/next.config.js rewrites subroutes');
  assertContains(hostConfig, '/remote-app-static/:path*', 'apps/host/next.config.js rewrites static assets');
}

/**
 * Verifies apps/remote-app basePath and assetPrefix configuration.
 */
function testRemoteZoneConfig() {
  const configPath = fs.existsSync(path.join(PROJECT_ROOT, 'apps/remote-app/next.config.js'))
    ? 'apps/remote-app/next.config.js'
    : 'apps/remote/next.config.js';

  const remoteConfig = readFileSafe(configPath);
  assertContains(remoteConfig, "basePath: '/remote-app'", `${configPath} basePath`);
  assertContains(remoteConfig, "assetPrefix: '/remote-app-static'", `${configPath} assetPrefix`);
}

/**
 * Executes all offline static invariant checks.
 * @param {object} initialReport
 * @returns {object} updated test report
 */
export function runStaticInvariantChecks(initialReport) {
  let report = initialReport;

  const testDefinitions = [
    { id: 'STATIC-01', desc: 'Zero Module Federation references in apps/', fn: testZeroFederationReferences },
    { id: 'STATIC-02', desc: 'tsconfig exactOptionalPropertyTypes: true in remote zone', fn: testExactOptionalPropertyTypes },
    { id: 'STATIC-03', desc: 'Cross-zone navigation uses plain <a> tags (no <Link>)', fn: testPlainHtmlNavigation },
    { id: 'STATIC-04', desc: 'Shell contains no DAL or database packages', fn: testShellDalExclusion },
    { id: 'STATIC-05', desc: 'Zone directory renamed to apps/remote-app with updated name', fn: testZoneRenameIntegrity },
    { id: 'STATIC-06', desc: 'Host next.config.js declares 3 rewrite rules (root, subroutes, static)', fn: testHostRewritesConfig },
    { id: 'STATIC-07', desc: 'Remote zone next.config.js sets basePath and assetPrefix', fn: testRemoteZoneConfig },
  ];

  console.log(`\n${ANSI.cyan}${ANSI.bold}--- Tier 1/2 Static Invariant Checks ---${ANSI.reset}`);

  for (const test of testDefinitions) {
    try {
      test.fn();
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
