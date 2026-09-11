# Milestone 1 Test & Verification Specification (R1, R2, R5)

**Role**: Milestone 1 Test & Verification Explorer  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_2`  
**Parent Agent ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Scope**: Milestone 1 Verification (`apps/remote-app` zone configuration, health check, and `_fragmento` contract)

---

## 1. Observation

### 1.1 Existing Test Convention & Runner Infrastructure
- File `apps/remote/lib/logger.test.mjs` (lines 1–2):
  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  ```
- File `package.json` (lines 20–24) and `apps/remote/package.json` (lines 56–70):
  - Neither Jest nor Vitest is declared in dependencies or devDependencies.
  - Global `expect()` is **not** defined in this runtime environment.
- File `apps/remote/package.json` (lines 64–69):
  - Declares `"@types/node": "^20.14.0"`, `"next": "^15.1.7"`, and `"typescript": "^5.4.5"`.
  - Node.js native test runner (`node:test`) and assertion module (`node:assert/strict`) are fully supported built-in modules in Node 20+.

### 1.2 Target Source File Specifications for Milestone 1
From `PROJECT.md` (§ Core Architecture Principles, § Interface Contracts) and `docs/superpowers/plans/2026-09-11-multizone-refactor.md` (Tasks 2 and 5):
1. **`apps/remote-app/next.config.js`**:
   - Must export `basePath: '/remote-app'`.
   - Must export `assetPrefix: '/remote-app-static'`.
   - Internal rewrite maps `/_fragmento/:name/:id` to API handler to bypass Pages Router underscore routing exclusion.
2. **`apps/remote-app/pages/api/health.ts`**:
   - Pure process liveness check without domain I/O.
   - Takes `(req: NextApiRequest, res: NextApiResponse)`.
   - Responds with HTTP 200 and JSON body `{ ok: true }`.
3. **`apps/remote-app/pages/_fragmento/[name]/[id].tsx`**:
   - GET-only endpoint (`req.method !== 'GET'` returns HTTP 405).
   - Validates fragment whitelist (`const KNOWN_FRAGMENTS = new Set(['demo'])`).
   - Unknown fragment returns HTTP 204 No Content (empty body, masks authorization/existence).
   - Known fragment returns HTTP 200 with header `Content-Type: text/html; charset=utf-8` and inert HTML body `<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`.
   - Fragment HTML contains strictly zero `<script>` tags or inline event handlers.

### 1.3 TypeScript Configuration & `exactOptionalPropertyTypes`
- `apps/remote/tsconfig.json` (lines 106–128):
  - `target: "es5"`, `moduleResolution: "bundler"`, `esModuleInterop: true`, `allowJs: true`, `noEmit: true`.
  - Include pattern: `["next-env.d.ts", "**/*.ts", "**/*.tsx"]`.
- `survey report` (`.agents/survey_remote_2/handoff.md`, §1.6):
  - Adding `"exactOptionalPropertyTypes": true` to `tsconfig.json` causes 5 TS2375 errors in `components/RemoteDashboard.tsx` unless `types/index.ts` marks optional props as `| undefined`.
  - Test files placed in `apps/remote-app/test/*.test.ts` are covered by `**/*.ts` and will be compiled during `npx tsc --noEmit`.

---

## 2. Logic Chain

### 2.1 Test Framework & Compatibility Reasoning
1. **Observation 1.1**: The initial draft in `docs/superpowers/plans/2026-09-11-multizone-refactor.md` used `expect(...).toBe(...)` without importing any assertion library.
2. **Inference**: In an environment executing `npx tsx --test` or `node --test`, calling undefined `expect` throws `ReferenceError: expect is not defined`.
3. **Observation 1.1 & Existing Pattern**: `apps/remote/lib/logger.test.mjs` successfully runs using Node built-ins:
   - `import test from 'node:test';`
   - `import assert from 'node:assert/strict';`
4. **Conclusion**: All Milestone 1 unit tests (`next-config.test.ts`, `health.test.ts`, `fragmento.test.ts`) must strictly use `node:test` and `node:assert/strict`. This guarantees:
   - Zero additional dependencies required.
   - 100% compatibility with `npx tsx --test`.
   - 100% compatibility with Node.js native test runner (`node --test`).

### 2.2 Next Config Test Logic Chain (`apps/remote-app/test/next-config.test.ts`)
1. **Observation 1.2 & 1.3**: `next.config.js` is a CommonJS module (`module.exports = nextConfig;`) while the test is TypeScript (`.ts`). `tsconfig.json` specifies `esModuleInterop: true`.
2. **Inference**:
   - `import nextConfig from '../next.config.js'` imports the configuration object.
   - To support both direct export and synthetic default interop without `any`, define interface `NextConfigProperties`:
     ```typescript
     interface NextConfigProperties {
       readonly basePath?: string;
       readonly assetPrefix?: string;
       readonly default?: NextConfigProperties;
     }
     ```
   - Resolve active config via `const config = rawConfig.default ?? rawConfig;`.
   - Assert `config.basePath === '/remote-app'` and `config.assetPrefix === '/remote-app-static'`.
   - This verifies that Multi-Zones asset routing will not produce 404s when the shell proxies requests.

### 2.3 Health Check Test Logic Chain (`apps/remote-app/test/health.test.ts`)
1. **Observation 1.2**: `handler(_req, res)` calls `res.status(200).json({ ok: true })`.
2. **Inference**:
   - A mock response object must implement `.status(code: number)` returning `this` and `.json(data: unknown)` recording the body.
   - A mock request object can be typed cleanly as `NextApiRequest`.
   - Execution: Call `handler(mockReq, mockRes as unknown as NextApiResponse)`.
   - Assertions:
     - `assert.equal(mockRes.statusCode, 200);`
     - `assert.deepEqual(mockRes.body, { ok: true });`
   - Strictly conforms to AAA (Arrange-Act-Assert) pattern with no domain I/O side effects.

### 2.4 Fragment Endpoint Test Logic Chain (`apps/remote-app/test/fragmento.test.ts`)
1. **Observation 1.2**: `handler(req, res)` enforces three critical contracts:
   - **Method guard**: If `req.method !== 'GET'`, calls `res.status(405).end()`.
   - **Absence masking**: If `!KNOWN_FRAGMENTS.has(name)`, calls `res.status(204).end()`.
   - **Safe inert HTML**: If `name === 'demo'`, encodes `id` via `encodeURIComponent(String(id))` and returns status 200, `Content-Type: text/html; charset=utf-8`, and body `<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`.
2. **Inference**:
   - The mock response must provide chainable `status()`, `setHeader()`, and `end()`.
   - Test Case 1 (Valid GET): `method: 'GET', query: { name: 'demo', id: '1' }`. Assert status 200, `Content-Type` matches `/text\/html/`, body contains `'id: 1'`, and body does NOT match `/<script/i`.
   - Test Case 2 (XSS Sanitization): `method: 'GET', query: { name: 'demo', id: '<script>alert("xss")</script>' }`. Assert status 200, body contains `%3Cscript%3E`, and body does NOT match `/<script/i`.
   - Test Case 3 (Unknown Fragment): `method: 'GET', query: { name: 'unknown', id: '1' }`. Assert status 204, empty body (`''`).
   - Test Case 4 (Method Not Allowed): `method: 'POST', query: { name: 'demo', id: '1' }`. Assert status 405.
   - All tests run against the direct handler import (`import handler from '../pages/_fragmento/[name]/[id]'`).

### 2.5 Compiler Type Checking (`npx tsc --noEmit`)
1. **Observation 1.3**: `tsconfig.json` includes `**/*.ts` which captures `test/*.test.ts`.
2. **Inference**: All mock types, interfaces, and function signatures in `test/*.test.ts` must be strongly typed with zero `any` declarations.
3. **Coordination note**: In Milestone 1, `npx tsc --noEmit` will validate `apps/remote-app`. For the entire app to pass with `exactOptionalPropertyTypes: true`, the implementation agent must also update the 9 optional fields in `apps/remote-app/types/index.ts` to include `| undefined` as established in the survey report.

---

## 3. Caveats

1. **Pages Router Underscore Resolution**: The unit test `fragmento.test.ts` imports the handler file directly from `../pages/_fragmento/[name]/[id]`, which passes in isolated test execution. However, for runtime HTTP requests (and the smoke test), Next.js Pages Router ignores `_` folders. The implementation agent must ensure `next.config.js` includes the internal rewrite to `pages/api/fragmento/[name]/[id].ts` to prevent runtime 404s.
2. **Execution Environment Permissions**: In restricted environments where `tsx` is not globally pre-installed, `npx tsx` may attempt to download `tsx`. If network access is constrained, `tsx` can be added to `apps/remote-app/package.json` `devDependencies` or run via Node's native module loader.
3. **Case Sensitivity of Headers**: Some HTTP frameworks lowercase header names (`content-type`). The test assertions in `fragmento.test.ts` check both `Content-Type` and `content-type` to avoid false assertion failures across different Next.js server/mock layers.

---

## 4. Conclusion & Exact Test Specifications

The exact TypeScript code for each required test file is defined below.

### 4.1 Exact Code: `apps/remote-app/test/next-config.test.ts`

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

interface NextConfigProperties {
  readonly basePath?: string;
  readonly assetPrefix?: string;
  readonly default?: NextConfigProperties;
}

// Support both direct CommonJS exports and synthetic default interop
const rawConfig: NextConfigProperties = nextConfig;
const config: NextConfigProperties = rawConfig.default ?? rawConfig;

test('basePath is configured as /remote-app for Multi-Zones routing', () => {
  // Arrange & Act - basePath must match shell gateway proxy prefix
  const { basePath } = config;

  // Assert
  assert.equal(basePath, '/remote-app');
});

test('assetPrefix is configured as /remote-app-static to avoid /_next collisions', () => {
  // Arrange & Act - assetPrefix isolates static chunks from host shell
  const { assetPrefix } = config;

  // Assert
  assert.equal(assetPrefix, '/remote-app-static');
});
```

---

### 4.2 Exact Code: `apps/remote-app/test/health.test.ts`

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/api/health';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
  };
  return res;
}

function createMockRequest(): NextApiRequest {
  return {} as NextApiRequest;
}

test('GET /remote-app/api/health returns 200 with { ok: true } without domain I/O', () => {
  // Arrange
  const mockReq = createMockRequest();
  const mockRes = createMockResponse();

  // Act - liveness check verifies process health without database/domain dependency
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  assert.deepEqual(mockRes.body, { ok: true });
});
```

---

### 4.3 Exact Code: `apps/remote-app/test/fragmento.test.ts`

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/_fragmento/[name]/[id]';

interface MockResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  status(code: number): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  end(chunk?: string): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: '',
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    end(chunk = '') {
      res.body = chunk;
    },
  };
  return res;
}

function createMockRequest(
  method: string,
  query: Record<string, string>
): NextApiRequest {
  return {
    method,
    query,
  } as unknown as NextApiRequest;
}

test('GET with name demo and id 1 returns 200 text/html with safe id and no script tags', () => {
  // Arrange
  const mockReq = createMockRequest('GET', { name: 'demo', id: '1' });
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  const contentType = mockRes.headers['Content-Type'] ?? mockRes.headers['content-type'] ?? '';
  assert.match(contentType, /text\/html/);
  assert.ok(mockRes.body.includes('id: 1'), 'Response body must include the fragment id');
  assert.doesNotMatch(mockRes.body, /<script/i, 'Fragment HTML must be inert with no script tags');
});

test('GET with potentially malicious id safely encodes and contains no script tags', () => {
  // Arrange - verify XSS prevention when id contains script markup
  const xssPayload = '<script>alert("xss")</script>';
  const mockReq = createMockRequest('GET', { name: 'demo', id: xssPayload });
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  assert.doesNotMatch(mockRes.body, /<script/i, 'Fragment HTML must sanitize/encode raw script tags');
  assert.ok(mockRes.body.includes('%3Cscript%3E'), 'Payload must be URI-encoded');
});

test('GET with unknown fragment name returns 204 No Content to mask existence/authorization', () => {
  // Arrange
  const mockReq = createMockRequest('GET', { name: 'unknown', id: '1' });
  const mockRes = createMockResponse();

  // Act - 204 represents both not found and not authorized (absence invariant)
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 204);
  assert.equal(mockRes.body, '', '204 response body must be empty');
});

test('POST request returns 405 Method Not Allowed', () => {
  // Arrange
  const mockReq = createMockRequest('POST', { name: 'demo', id: '1' });
  const mockRes = createMockResponse();

  // Act - fragment endpoint accepts GET only
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 405);
});
```

---

## 5. Verification Method

To independently execute and verify all Milestone 1 tests and compiler checks:

### 5.1 Verification Commands

1. **Verify `next.config.js` configuration**:
   ```bash
   cd apps/remote-app && npx tsx --test test/next-config.test.ts
   ```
   *Expected outcome*: 2 passing tests (`basePath` and `assetPrefix`).

2. **Verify Health Check endpoint**:
   ```bash
   cd apps/remote-app && npx tsx --test test/health.test.ts
   ```
   *Expected outcome*: 1 passing test (status 200, `{ ok: true }`).

3. **Verify Fragment (`_fragmento`) contract**:
   ```bash
   cd apps/remote-app && npx tsx --test test/fragmento.test.ts
   ```
   *Expected outcome*: 4 passing tests (200 text/html no `<script>`, XSS encoding verification, 204 for unknown name, 405 for POST).

4. **Verify All Milestone 1 tests together**:
   ```bash
   cd apps/remote-app && npx tsx --test test/next-config.test.ts test/health.test.ts test/fragmento.test.ts
   ```
   *Expected outcome*: 7 passing tests, 0 failures.

5. **Verify TypeScript Strict Compilation & Exact Optional Types**:
   ```bash
   cd apps/remote-app && npx tsc --noEmit
   ```
   *Expected outcome*: Exit code 0, 0 compiler errors (assuming `types/index.ts` optional property alignment is applied).

### 5.2 Invalidation Conditions
- Any test using Jest/Vitest globals (`expect()`) instead of `assert` from `node:assert/strict`.
- `next-config.test.ts` failing if `basePath !== '/remote-app'` or `assetPrefix !== '/remote-app-static'`.
- `fragmento.test.ts` failing if a response with status 200 contains any `<script>` tag or if unknown fragments return anything other than HTTP 204.
- `tsc --noEmit` emitting TS2375 due to missing `| undefined` in `types/index.ts`.
