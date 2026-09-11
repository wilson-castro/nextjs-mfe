#!/usr/bin/env node

/**
 * @file scripts/smoke-test.mjs
 * Next.js Multi-Zones Smoke and End-to-End Test Suite.
 *
 * Usage:
 *   node scripts/smoke-test.mjs            # Runs offline checks; runs online if servers are up
 *   node scripts/smoke-test.mjs --offline  # Only runs offline static invariant checks
 *   node scripts/smoke-test.mjs --online   # Runs online smoke checks (fails if servers are down)
 *   node scripts/smoke-test.mjs --strict   # Requires both static checks and online servers to pass
 */

import {
  ANSI,
  createTestReport,
  isServerReachable,
  recordTestResult,
} from '../test/e2e/test-helpers.mjs';
import { runStaticInvariantChecks } from '../test/e2e/static-invariants.mjs';
import { runOnlineSmokeChecks } from '../test/e2e/online-smoke.mjs';

const HOST_URL = process.env.HOST_URL ?? 'http://localhost:3000';
const ZONE_URL = process.env.ZONE_URL ?? 'http://localhost:3001';

/**
 * Parses command-line arguments into a structured options object.
 * @param {Array<string>} argv
 * @returns {{ isOfflineOnly: boolean, isOnlineOnly: boolean, isStrict: boolean }}
 */
function parseCommandLineArgs(argv) {
  const flags = new Set(argv.slice(2));
  if (flags.has('--help') || flags.has('-h')) {
    printHelpAndExit();
  }

  return {
    isOfflineOnly: flags.has('--offline'),
    isOnlineOnly: flags.has('--online'),
    isStrict: flags.has('--strict') || flags.has('--ci'),
  };
}

/**
 * Prints usage instructions and exits.
 */
function printHelpAndExit() {
  console.log(`
Next.js Multi-Zones Smoke Test Runner

Usage:
  node scripts/smoke-test.mjs [options]

Options:
  --offline       Run only offline static invariant checks
  --online        Run online checks against localhost:3000 and localhost:3001
  --strict, --ci  Strict mode: fail if any test fails or if servers are offline
  --help, -h      Show this help message
`);
  process.exit(0);
}

/**
 * Prints a section banner with consistent styling.
 * @param {string} title
 */
function printBanner(title) {
  console.log(`\n${ANSI.bold}====================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}🚀 ${title}${ANSI.reset}`);
  console.log(`${ANSI.bold}====================================================${ANSI.reset}`);
}

/**
 * Prints the final summary table and results.
 * @param {object} report
 */
function printReportSummary(report) {
  const total = report.passed.length + report.failed.length + report.skipped.length;
  console.log(`\n${ANSI.bold}----------------------------------------------------${ANSI.reset}`);
  console.log(`${ANSI.bold}Execution Summary:${ANSI.reset}`);
  console.log(`  Total tests:   ${total}`);
  console.log(`  ${ANSI.green}Passed:${ANSI.reset}        ${report.passed.length}`);
  console.log(`  ${ANSI.red}Failed:${ANSI.reset}        ${report.failed.length}`);
  console.log(`  ${ANSI.yellow}Skipped:${ANSI.reset}       ${report.skipped.length}`);
  console.log(`${ANSI.bold}----------------------------------------------------${ANSI.reset}`);

  if (report.failed.length > 0) {
    console.log(`\n${ANSI.red}${ANSI.bold}FAILED TESTS:${ANSI.reset}`);
    for (const fail of report.failed) {
      console.log(`  - [${fail.id}] ${fail.description}`);
      console.log(`    ${fail.error}`);
    }
  }
}

/**
 * Checks server availability on host and zone ports.
 * @returns {Promise<{ isHostOnline: boolean, isZoneOnline: boolean }>}
 */
async function probeServerAvailability() {
  console.log(`\n${ANSI.cyan}${ANSI.bold}--- Probing Target Servers ---${ANSI.reset}`);
  const isHostOnline = await isServerReachable(HOST_URL);
  const isZoneOnline = await isServerReachable(ZONE_URL);

  const hostStatus = isHostOnline ? `${ANSI.green}ONLINE${ANSI.reset}` : `${ANSI.yellow}OFFLINE${ANSI.reset}`;
  const zoneStatus = isZoneOnline ? `${ANSI.green}ONLINE${ANSI.reset}` : `${ANSI.yellow}OFFLINE${ANSI.reset}`;

  console.log(`  Host Shell (${HOST_URL}): ${hostStatus}`);
  console.log(`  Remote Zone (${ZONE_URL}): ${zoneStatus}`);

  return { isHostOnline, isZoneOnline };
}

/**
 * Handles skipping online checks when servers are offline.
 * @param {object} report
 * @param {boolean} isStrict
 * @returns {object} updated report
 */
function handleOfflineServers(report, isStrict) {
  if (isStrict) {
    const errorMsg = 'Strict mode enabled: Target servers must be online on ports 3000 and 3001';
    console.log(`\n${ANSI.red}✗ ERROR: ${errorMsg}${ANSI.reset}`);
    return recordTestResult(report, {
      id: 'ONLINE-CONNECT',
      description: 'Host and Remote servers connectivity',
      passed: false,
      error: errorMsg,
    });
  }

  console.log(`\n${ANSI.yellow}ℹ Notice: Servers are offline. Skipping online HTTP checks.${ANSI.reset}`);
  console.log(`${ANSI.gray}To run online checks: start servers with "pnpm dev" or "pnpm start"${ANSI.reset}`);
  return recordTestResult(report, {
    id: 'ONLINE-SUITE',
    description: 'Online HTTP checks (skipped: servers offline)',
    skipped: true,
  });
}

/**
 * Main test suite execution orchestrator.
 */
async function main() {
  const options = parseCommandLineArgs(process.argv);
  printBanner('Next.js Multi-Zones Opaque-Box E2E Smoke Suite');

  let report = createTestReport();

  if (!options.isOnlineOnly) {
    report = runStaticInvariantChecks(report);
  }

  if (options.isOfflineOnly) {
    printReportSummary(report);
    process.exit(report.failed.length > 0 ? 1 : 0);
  }

  const { isHostOnline, isZoneOnline } = await probeServerAvailability();
  const areServersReady = isHostOnline && isZoneOnline;

  if (!areServersReady) {
    report = handleOfflineServers(report, options.isStrict || options.isOnlineOnly);
  } else {
    report = await runOnlineSmokeChecks(report);
  }

  printReportSummary(report);
  const exitCode = report.failed.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`\n${ANSI.red}Fatal test runner error:${ANSI.reset}`, err);
  process.exit(1);
});
