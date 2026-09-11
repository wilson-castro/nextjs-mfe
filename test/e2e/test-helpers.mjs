/**
 * @file test-helpers.mjs
 * Shared utility functions, constants, and assertion helpers for Multi-Zones E2E tests.
 */

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Creates an empty test report collector.
 * @returns {{ passed: Array<object>, failed: Array<object>, skipped: Array<object> }}
 */
export function createTestReport() {
  return {
    passed: [],
    failed: [],
    skipped: [],
  };
}

/**
 * Returns a new report with the test result appended.
 * @param {object} report
 * @param {object} result - { id, description, passed, error, skipped }
 */
export function recordTestResult(report, result) {
  if (result.skipped) {
    return {
      ...report,
      skipped: [...report.skipped, result],
    };
  }
  if (result.passed) {
    return {
      ...report,
      passed: [...report.passed, result],
    };
  }
  return {
    ...report,
    failed: [...report.failed, result],
  };
}

/**
 * Performs an HTTP request with timeout.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ status: number, headers: Headers, body: string }>}
 */
export async function httpFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Checks if a given host URL is reachable.
 * @param {string} url
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<boolean>}
 */
export async function isServerReachable(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Asserts HTTP status code matches expected.
 * @param {number} actual
 * @param {number} expected
 * @param {string} context
 */
export function assertStatusCode(actual, expected, context = '') {
  if (actual !== expected) {
    throw new Error(`${context}: Expected HTTP ${expected}, received HTTP ${actual}`);
  }
}

/**
 * Asserts string contains substring.
 * @param {string} haystack
 * @param {string} needle
 * @param {string} context
 */
export function assertContains(haystack, needle, context = '') {
  if (!haystack.includes(needle)) {
    throw new Error(`${context}: Expected content to contain "${needle}"`);
  }
}

/**
 * Asserts string does NOT match regex.
 * @param {string} haystack
 * @param {RegExp} pattern
 * @param {string} context
 */
export function assertNotRegex(haystack, pattern, context = '') {
  if (pattern.test(haystack)) {
    throw new Error(`${context}: Expected content NOT to match pattern ${pattern}`);
  }
}

/**
 * Asserts string matches regex.
 * @param {string} haystack
 * @param {RegExp} pattern
 * @param {string} context
 */
export function assertRegex(haystack, pattern, context = '') {
  if (!pattern.test(haystack)) {
    throw new Error(`${context}: Expected content to match pattern ${pattern}`);
  }
}
