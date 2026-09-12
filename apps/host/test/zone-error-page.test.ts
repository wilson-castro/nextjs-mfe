import test from 'node:test';
import assert from 'node:assert/strict';
import { renderZoneErrorHtml } from '../lib/zoneErrorPage.ts';
import { ZONE_ERROR_HEADING, ZONE_ERROR_MESSAGE } from '../lib/zoneErrorContent.ts';

/**
 * The outage fallback rendered directly by middleware.ts (F1 fix) must be a
 * self-contained HTML document: no <script>, no reference to the zone's own
 * host/port, and recognizable as the shell's own error surface rather than a
 * bare framework 500.
 */

test('renderZoneErrorHtml() returns a full standalone HTML document', () => {
  const html = renderZoneErrorHtml();

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html/i);
  assert.match(html, /<\/html>/i);
});

test('renderZoneErrorHtml() contains the shared shell error copy', () => {
  const html = renderZoneErrorHtml();

  assert.ok(html.includes(ZONE_ERROR_HEADING), 'must include the shared heading text');
  assert.ok(html.includes(ZONE_ERROR_MESSAGE), 'must include the shared message text');
});

test('renderZoneErrorHtml() is inert: no <script> tags, no domain/zone fetch calls', () => {
  const html = renderZoneErrorHtml();

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /fetch\(/i);
});

test('renderZoneErrorHtml() output does not depend on any runtime input (deterministic, standalone)', () => {
  const first = renderZoneErrorHtml();
  const second = renderZoneErrorHtml();

  assert.equal(first, second);
});
