import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `/erro-de-zona` (F1) must render with every zone down: no domain fetch, no
 * DAL, no dependency on the remote-app zone process at all.
 *
 * The page is a .tsx React component, so it can't be `import`-ed directly
 * under plain `node --test` (JSX isn't stripped by Node's type-stripping,
 * only TypeScript type annotations are) -- the same reason none of this
 * repo's existing test/*.test.ts files import a .tsx module. Instead this
 * verifies the invariant the same way test/e2e/static-invariants.mjs does:
 * by reading the page's own source text.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = path.join(__dirname, '..', 'pages', 'erro-de-zona.tsx');

function readPageSource(): string {
  assert.ok(fs.existsSync(PAGE_PATH), `expected page file to exist at ${PAGE_PATH}`);
  return fs.readFileSync(PAGE_PATH, 'utf-8');
}

test('pages/erro-de-zona.tsx exists', () => {
  assert.ok(fs.existsSync(PAGE_PATH));
});

test('pages/erro-de-zona.tsx has no server-side data fetching (getServerSideProps/getStaticProps)', () => {
  const source = readPageSource();

  assert.doesNotMatch(
    source,
    /export\s+(const|async function|function)\s+getServerSideProps/,
    'the page must not depend on any per-request server-side data fetching'
  );
  assert.doesNotMatch(
    source,
    /export\s+(const|async function|function)\s+getStaticProps/,
    'the page must not depend on build-time data fetching either'
  );
});

test('pages/erro-de-zona.tsx never calls fetch() or reaches for the remote zone URL', () => {
  const source = readPageSource();

  assert.doesNotMatch(source, /fetch\(/, 'the page must render without any network call');
  assert.doesNotMatch(
    source,
    /REMOTE_ZONE_URL|REMOTE_APP_URL|localhost:3001/,
    'the page must not reference the zone origin at all'
  );
});

test('pages/erro-de-zona.tsx exports a default React component', () => {
  const source = readPageSource();

  assert.match(source, /export\s+default\s+/, 'the page module must have a default export');
});

test('pages/erro-de-zona.tsx renders the shared shell error copy', () => {
  const source = readPageSource();

  assert.match(source, /ZONE_ERROR_HEADING|ZONE_ERROR_MESSAGE/, 'must reuse the shared copy so the standalone page and the outage fallback stay in sync');
});
