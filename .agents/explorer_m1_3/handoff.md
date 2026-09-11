# Milestone 1 Edge Cases, Invariants, and Failure Defense Report (R1, R2, R5)

**Role**: Milestone 1 Edge Cases & Invariants Explorer  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_3`  
**Parent Agent ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Scope**: Milestone 1 Remote Zone Refactoring (`apps/remote` → `apps/remote-app`, R1, R2, R5)  

---

## 1. Observation

### 1.1 Next.js Pages Router Underscore Prefix Routing Mechanics
- **Pages Router Specification**: In Next.js Pages Router, files and folders prefixed with an underscore (`_`) within `pages/` (such as `pages/_app.tsx`, `pages/_document.tsx`, `pages/_error.tsx`, or custom directories like `pages/_fragmento/`) are designated as internal framework files.
- **Routing Exclusion**: Next.js completely excludes `_`-prefixed folders from the file-system routing manifest. A file located at `pages/_fragmento/[name]/[id].tsx` will never be mapped to an incoming HTTP URL by default.
- **SSR Page vs API Handler Mismatch**: Files directly under `pages/` (outside `pages/api/`) are treated by Next.js as React page components intended to export a React functional component. Conversely, API routes (files under `pages/api/`) expect a default export of a Node HTTP request handler `(req: NextApiRequest, res: NextApiResponse) => void | Promise<void>`.
- **Requirements Collision**:
  1. Acceptance test requirement (`apps/remote-app/test/fragmento.test.ts`):
     ```typescript
     import handler from '../pages/_fragmento/[name]/[id]';
     ```
  2. Live HTTP smoke test requirement (`test/e2e/online-smoke.mjs` line 93 & line 111):
     ```javascript
     const url = `${HOST_BASE_URL}/remote-app/_fragmento/demo/42`;
     const res = await httpFetch(url);
     // Expects HTTP 200, Content-Type: text/html, body with "Demo fragment (id: 42)"
     ```
  3. Direct zone probe requirement (`test/e2e/online-smoke.mjs` line 122 & line 135):
     - `GET http://localhost:3000/remote-app/_fragmento/unknown/1` → HTTP 204 No Content (0-byte body).
     - `POST http://localhost:3000/remote-app/_fragmento/demo/1` → HTTP 405 Method Not Allowed.

### 1.2 `exactOptionalPropertyTypes: true` Compiler Diagnostics
- Executing `npx tsc --noEmit --exactOptionalPropertyTypes` in `apps/remote` produced verbatim 5 `TS2375` errors across 1 file (`components/RemoteDashboard.tsx`):
  ```
  components/RemoteDashboard.tsx(31,12): error TS2375: Type '{ initialData: ServerPayload | undefined; session: UserSession | undefined; }' is not assignable to type 'ServerCardProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
    Types of property 'initialData' are incompatible.
      Type 'ServerPayload | undefined' is not assignable to type 'ServerPayload'.
        Type 'undefined' is not assignable to type 'ServerPayload'.
  components/RemoteDashboard.tsx(37,12): error TS2375: Type '{ filterLevel: "info" | "warn" | "critical" | "all"; session: UserSession | undefined; }' is not assignable to type 'RemoteTelemetryProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
    Types of property 'session' are incompatible.
      Type 'UserSession | undefined' is not assignable to type 'UserSession'.
        Type 'undefined' is not assignable to type 'UserSession'.
  components/RemoteDashboard.tsx(46,12): error TS2375: Type '{ lat: number | undefined; lng: number | undefined; selectedCity: string | undefined; session: UserSession | undefined; }' is not assignable to type 'RemoteMapProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
    Types of property 'selectedCity' are incompatible.
      Type 'string | undefined' is not assignable to type 'string'.
        Type 'undefined' is not assignable to type 'string'.
  components/RemoteDashboard.tsx(57,12): error TS2375: Type '{ initialData: ServerPayload | undefined; session: UserSession | undefined; title: string; }' is not assignable to type 'ServerCardProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
    Types of property 'initialData' are incompatible.
      Type 'ServerPayload | undefined' is not assignable to type 'ServerPayload'.
        Type 'undefined' is not assignable to type 'ServerPayload'.
  components/RemoteDashboard.tsx(59,14): error TS2375: Type '{ filterLevel: "warn"; session: UserSession | undefined; maxEvents: number; }' is not assignable to type 'RemoteTelemetryProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
    Types of property 'session' are incompatible.
      Type 'UserSession | undefined' is not assignable to type 'UserSession'.
        Type 'undefined' is not assignable to type 'UserSession'.
  TypeScript: 5 errors in 1 files
  ```
- Current definitions in `apps/remote/types/index.ts`:
  - `ServerCardProps` (lines 51–55):
    ```typescript
    export interface ServerCardProps {
      readonly initialData?: ServerPayload;
      readonly title?: string;
      readonly session?: UserSession;
    }
    ```
  - `RemoteMapProps` (lines 57–64):
    ```typescript
    export interface RemoteMapProps {
      readonly selectedCity?: string;
      readonly lat?: number;
      readonly lng?: number;
      readonly zoom?: number;
      readonly onMarkerClick?: (marker: MapMarker) => void;
      readonly session?: UserSession;
    }
    ```
  - `RemoteTelemetryProps` (lines 66–70):
    ```typescript
    export interface RemoteTelemetryProps {
      readonly filterLevel?: 'all' | 'info' | 'warn' | 'critical';
      readonly maxEvents?: number;
      readonly session?: UserSession;
    }
    ```
- All other files in `apps/remote` (`pages/index.tsx`, `pages/_app.tsx`, `pages/404.tsx`, `pages/500.tsx`, `pages/api/server-data.ts`, `pages/api/sse-events.ts`, `components/ServerCard.tsx`, `components/RemoteMap.tsx`, `components/RemoteTelemetry.tsx`, `lib/cache.ts`, `lib/events.ts`, `lib/getServerData.ts`, `lib/logger.ts`) pass typechecking cleanly.

### 1.3 Package Rename and Workspace Script Dependencies
- `apps/remote/package.json`:
  ```json
  "name": "@mfe/remote",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3001",
    "build": "NEXT_PRIVATE_LOCAL_WEBPACK=true next build",
    "start": "next start -p 3001",
    "typecheck": "tsc --noEmit"
  }
  ```
- Root `package.json` (lines 6, 9, 12, 15):
  ```json
  "dev:remote": "pnpm --filter @mfe/remote dev",
  "build:remote": "pnpm --filter @mfe/remote build",
  "start:remote": "pnpm --filter @mfe/remote start",
  "typecheck": "pnpm --filter @mfe/remote typecheck && pnpm --filter @mfe/host typecheck",
  ```
- Package cross-dependencies: Neither `apps/host/package.json` nor `apps/remote/package.json` declares a dependency on the other. They are completely decoupled at the package dependency level.
- Static invariant validator (`test/e2e/static-invariants.mjs` lines 149–152):
  ```javascript
  const isValidName = pkg.name === 'remote-app' || pkg.name === '@mfe/remote-app';
  if (!isValidName) {
    throw new Error(`apps/remote-app/package.json name expected "remote-app" or "@mfe/remote-app", found "${pkg.name}"`);
  }
  ```
- `git mv` directory behavior: When `git mv apps/remote apps/remote-app` is executed, git only moves tracked files. Untracked files (specifically `apps/remote/node_modules/` or build caches) remain in `apps/remote/` unless explicitly purged.

### 1.4 Module Federation Presence in `apps/remote`
- A regex grep for `@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard` across `apps/remote` matched only 2 files:
  1. `apps/remote/package.json` line 12: `"@module-federation/nextjs-mf": "^8.8.74"`
  2. `apps/remote/next.config.js` lines 1, 8, 10:
     - `const { NextFederationPlugin } = require('@module-federation/nextjs-mf');`
     - `new NextFederationPlugin({ ... })`
     - `filename: 'static/chunks/remoteEntry.js'`
- Zero component or library files in `apps/remote` import from `@module-federation`.
- In `apps/remote/package.json`, `webpack: "5.90.3"` and `NEXT_PRIVATE_LOCAL_WEBPACK=true` were included solely to satisfy `@module-federation/nextjs-mf`.

### 1.5 Test Runner Environment
- `tsx` version: `4.23.13` (Node.js `v26.8.1`).
- Neither `jest` nor `vitest` is declared or installed in monorepo dependencies.
- Existing tests in the repository (`apps/remote/lib/logger.test.mjs`, `test/e2e/*.mjs`) use Node's native test runner (`node:test`) and strict assertions (`node:assert/strict`).

---

## 2. Logic Chain

### 2.1 Next.js Pages Router Routing Invariant & `_fragmento` Solution Architecture
1. **Premise 1**: Acceptance criteria mandate that unit tests run `import handler from '../pages/_fragmento/[name]/[id]'`.
2. **Premise 2**: Pages Router strictly ignores `pages/_*` from file-system URL mapping. Any incoming HTTP request directly to `/remote-app/_fragmento/demo/42` will result in a 404 Not Found if no routing bridge exists.
3. **Premise 3**: Rewrites pointing directly to `destination: '/_fragmento/:name/:id'` also fail with 404 because Next.js router still refuses to match underscore directories.
4. **Premise 4**: Next.js Pages Router treats files in `pages/api/` as HTTP API routes (`NextApiRequest`, `NextApiResponse`).
5. **Deduction & Defensive Architecture**:
   - Create `apps/remote-app/pages/_fragmento/[name]/[id].tsx` containing the canonical handler logic. This directly satisfies unit test imports (`import handler from '../pages/_fragmento/[name]/[id]'`).
   - Create `apps/remote-app/pages/api/fragmento/[name]/[id].ts` that re-exports the handler:
     ```typescript
     import handler from '../../../_fragmento/[name]/[id]';
     export default handler;
     ```
   - In `apps/remote-app/next.config.js`, configure an internal rewrite:
     ```javascript
     async rewrites() {
       return [
         {
           source: '/_fragmento/:name/:id',
           destination: '/api/fragmento/:name/:id',
         },
       ];
     }
     ```
   - When an HTTP request arrives for `GET /remote-app/_fragmento/demo/42`:
     1. Next.js strips `basePath: '/remote-app'`, matching `source: '/_fragmento/:name/:id'`.
     2. Next.js internally rewrites the request to `destination: '/api/fragmento/:name/:id'`.
     3. Next.js dispatches to the API route `pages/api/fragmento/[name]/[id].ts`.
     4. The handler executes and produces the inert HTML response.
   - For `GET /remote-app/api/health`: Because `pages/api/health.ts` has no underscore prefix, Next.js natively mounts it at `/api/health`, which under `basePath: '/remote-app'` is served at `/remote-app/api/health` without requiring any rewrite.

### 2.2 `exactOptionalPropertyTypes: true` Type Safety Guarantee
1. **Premise 1**: In standard TypeScript, an optional property `prop?: T` allows omitting the property OR passing `undefined` (`T | undefined`).
2. **Premise 2**: Under `exactOptionalPropertyTypes: true`, `prop?: T` strictly allows omitting the property, but does NOT allow `{ prop: undefined }`.
3. **Premise 3**: In `components/RemoteDashboard.tsx`:
   - `initialData={serverData || undefined}` passes `ServerPayload | undefined`.
   - `session={session}` passes `UserSession | undefined`.
   - `selectedCity={queryParams?.city}` passes `string | undefined`.
   - `lat={queryParams?.lat}` passes `number | undefined`.
   - `lng={queryParams?.lng}` passes `number | undefined`.
4. **Deduction**:
   - Updating `types/index.ts` to append `| undefined` to every optional field (`initialData?: ServerPayload | undefined`, `session?: UserSession | undefined`, etc.) precisely aligns type definitions with runtime usage.
   - This completely eliminates all 5 `TS2375` errors without requiring any changes to component logic and without disabling the compiler flag.

### 2.3 Package Rename and Workspace Integrity Protection
1. **Premise 1**: Root `package.json` contains scripts with `--filter @mfe/remote`.
2. **Premise 2**: When `apps/remote/package.json` is renamed to `"name": "remote-app"`, any pnpm command filtering by `@mfe/remote` will fail with `ERR_PNPM_NO_MATCHING_PKG`.
3. **Premise 3**: `git mv apps/remote apps/remote-app` leaves behind untracked directories (such as `apps/remote/node_modules/`).
4. **Deduction**:
   - The Worker must update root `package.json` scripts:
     - `dev:remote` → `pnpm --filter remote-app dev`
     - `build:remote` → `pnpm --filter remote-app build`
     - `start:remote` → `pnpm --filter remote-app start`
     - `typecheck` → `pnpm --filter remote-app typecheck && pnpm --filter @mfe/host typecheck`
   - The Worker must clean up leftover untracked artifacts from `apps/remote` after `git mv` (`rm -rf apps/remote`).
   - Running `pnpm install` regenerates workspace symlinks in `node_modules/` and updates `pnpm-lock.yaml`.

### 2.4 Test Runner Assertion Invariant
1. **Premise 1**: Test execution command is `npx tsx --test test/*.test.ts`.
2. **Premise 2**: Node.js native test runner (`node:test`) does NOT define a global `expect`.
3. **Deduction**:
   - If tests in `test/*.test.ts` rely on global `expect(...)`, they will crash with `ReferenceError: expect is not defined`.
   - All tests must import and use standard `node:test` and `node:assert/strict`.

---

## 3. Caveats

1. **Host Shell Rewrite Dependency (M2)**: Testing `http://localhost:3000/remote-app/_fragmento/demo/42` end-to-end requires `apps/host` to be running with its M2 rewrites in place. During M1, verification of live HTTP requests must be performed directly against port 3001 (`http://localhost:3001/remote-app/_fragmento/demo/42` and `http://localhost:3001/remote-app/api/health`).
2. **Trailing Slashes on Rewrite Rules**: Next.js Pages Router is sensitive to trailing slashes if `trailingSlash: true` is set. Since neither `next.config.js` specifies `trailingSlash`, strict match `/_fragmento/:name/:id` is reliable.
3. **`node_modules` Stale Symlinks in Development**: If the developer executes commands in an active shell while `git mv` occurs, bash directory hashing may point to stale paths. Running `hash -r` or running from repo root resolves this.
4. **SSE Event Route Relative URL**: In `components/RemoteTelemetry.tsx`, the component constructs SSE connection URLs. While not part of R1, R2, or R5, `basePath: '/remote-app'` changes the relative path to `/remote-app/api/sse-events`.

---

## 4. Conclusion & Defensive Guidelines for Worker

### Guideline 1: Fragment Endpoint Structure (`_fragmento` + API Route + Rewrite)
The Worker must create three coordinated pieces in `apps/remote-app`:
1. **Handler Implementation** at `apps/remote-app/pages/_fragmento/[name]/[id].tsx`:
   - Enforce `req.method === 'GET'`, else `res.status(405).end()`.
   - Whitelist check: `const KNOWN_FRAGMENTS = new Set(['demo']);`.
   - If `!name || !KNOWN_FRAGMENTS.has(String(name))`: return `res.status(204).end()`.
   - Sanitization: `const safeId = encodeURIComponent(String(id ?? ''));`.
   - Set header: `res.setHeader('Content-Type', 'text/html; charset=utf-8');`.
   - Return inert HTML: `res.status(200).end('<div class="fragment fragment--' + name + '"><p>Demo fragment (id: ' + safeId + ')</p></div>');`.
   - **Crucial Security & Invariant Defenses**:
     - Never output `<script>` tags or inline event handlers (`onclick`, `onload`).
     - Never write a body for HTTP 204 (must be 0 bytes; use `.end()`).
     - Never return 403 or 404 for unknown/unauthorized fragments; always return 204.
2. **API Route Target** at `apps/remote-app/pages/api/fragmento/[name]/[id].ts`:
   ```typescript
   import handler from '../../../_fragmento/[name]/[id]';
   export default handler;
   ```
3. **Next.js Rewrite** in `apps/remote-app/next.config.js`:
   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     basePath: '/remote-app',
     assetPrefix: '/remote-app-static',
     async rewrites() {
       return [
         {
           source: '/_fragmento/:name/:id',
           destination: '/api/fragmento/:name/:id',
         },
       ];
     },
   };

   module.exports = nextConfig;
   ```

### Guideline 2: Complete `types/index.ts` Modifications
In `apps/remote-app/types/index.ts`, replace the prop interfaces with explicit `| undefined` unions:

```typescript
export interface ServerCardProps {
  readonly initialData?: ServerPayload | undefined;
  readonly title?: string | undefined;
  readonly session?: UserSession | undefined;
}

export interface RemoteMapProps {
  readonly selectedCity?: string | undefined;
  readonly lat?: number | undefined;
  readonly lng?: number | undefined;
  readonly zoom?: number | undefined;
  readonly onMarkerClick?: ((marker: MapMarker) => void) | undefined;
  readonly session?: UserSession | undefined;
}

export interface RemoteTelemetryProps {
  readonly filterLevel?: ('all' | 'info' | 'warn' | 'critical') | undefined;
  readonly maxEvents?: number | undefined;
  readonly session?: UserSession | undefined;
}

export interface ServerPayload {
  readonly origin: string;
  readonly timestamp: string;
  readonly serverNodeVersion: string;
  readonly requestId: string;
  readonly session?: UserSession | null | undefined;
  readonly metrics: ServerMetrics;
  readonly cached?: boolean | undefined;
}
```

In `components/RemoteDashboard.tsx`, also update `RemoteDashboardProps`:
```typescript
export interface RemoteDashboardProps {
  readonly activeTab?: ('overview' | 'telemetry' | 'map' | 'metrics') | undefined;
  readonly serverData?: ServerPayload | null | undefined;
  readonly session?: UserSession | undefined;
  readonly queryParams?: {
    readonly filter?: ('all' | 'info' | 'warn' | 'critical') | undefined;
    readonly city?: string | undefined;
    readonly lat?: number | undefined;
    readonly lng?: number | undefined;
  } | undefined;
}
```

### Guideline 3: Package Renaming & Ghost Directory Cleanup Order
The Worker must execute operations in this exact order:
1. `git mv apps/remote apps/remote-app`
2. Remove any leftover untracked folder: `rm -rf apps/remote`
3. Update `apps/remote-app/package.json`:
   - Set `"name": "remote-app"`
   - Remove `"@module-federation/nextjs-mf"` from `dependencies`
   - Clean scripts:
     ```json
     "scripts": {
       "dev": "next dev -p 3001",
       "build": "next build",
       "start": "next start -p 3001",
       "typecheck": "tsc --noEmit",
       "test": "tsx --test test/*.test.ts"
     }
     ```
4. Update root `package.json`:
   - Change `"dev:remote"` to `"pnpm --filter remote-app dev"`
   - Change `"build:remote"` to `"pnpm --filter remote-app build"`
   - Change `"start:remote"` to `"pnpm --filter remote-app start"`
   - Change `"typecheck"` to `"pnpm --filter remote-app typecheck && pnpm --filter @mfe/host typecheck"`
5. Run `pnpm install` from repository root to update symlinks and `pnpm-lock.yaml`.

### Guideline 4: Health Check Endpoint Implementation
Create `apps/remote-app/pages/api/health.ts`:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(200).json({ ok: true });
}
```
*Defense*: Zero domain imports, zero database calls, zero filesystem reads. Pure process liveness check.

### Guideline 5: Unit Test Implementation Guidelines (Using `node:assert/strict`)
All unit tests in `apps/remote-app/test/` must use Node's native test runner and assert library:
- `test/next-config.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import nextConfig from '../next.config.js';

  test('basePath is /remote-app', () => {
    assert.strictEqual(nextConfig.basePath, '/remote-app');
  });

  test('assetPrefix is /remote-app-static', () => {
    assert.strictEqual(nextConfig.assetPrefix, '/remote-app-static');
  });
  ```
- `test/health.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import type { NextApiRequest, NextApiResponse } from 'next';
  import handler from '../pages/api/health';

  type MockRes = {
    _status: number;
    _body: unknown;
    status(n: number): MockRes;
    json(b: unknown): void;
  };

  function createMockRes(): MockRes {
    const res: MockRes = {
      _status: 0,
      _body: undefined,
      status(n: number) { res._status = n; return res; },
      json(b: unknown) { res._body = b; },
    };
    return res;
  }

  test('returns 200 { ok: true }', () => {
    const res = createMockRes();
    handler({} as NextApiRequest, res as unknown as NextApiResponse);
    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._body, { ok: true });
  });
  ```
- `test/fragmento.test.ts`:
  ```typescript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import type { NextApiRequest, NextApiResponse } from 'next';
  import handler from '../pages/_fragmento/[name]/[id]';

  type MockRes = {
    _status: number;
    _body: string;
    _headers: Record<string, string>;
    status(n: number): MockRes;
    setHeader(k: string, v: string): MockRes;
    end(b?: string): void;
  };

  function createMockRes(): MockRes {
    const r: MockRes = {
      _status: 0,
      _body: '',
      _headers: {},
      status(n) { r._status = n; return r; },
      setHeader(k, v) { r._headers[k.toLowerCase()] = v; return r; },
      end(b = '') { r._body = b; },
    };
    return r;
  }

  function createMockReq(method: string, query: Record<string, string>): NextApiRequest {
    return { method, query } as unknown as NextApiRequest;
  }

  test('GET returns 200 text/html for known fragment name', () => {
    const res = createMockRes();
    handler(createMockReq('GET', { name: 'demo', id: '42' }), res as unknown as NextApiResponse);
    assert.strictEqual(res._status, 200);
    assert.match(res._headers['content-type'] ?? '', /text\/html/);
    assert.doesNotMatch(res._body, /<script/i);
    assert.doesNotMatch(res._body, /on[a-z]+=/i);
    assert.match(res._body, /Demo fragment \(id: 42\)/);
  });

  test('GET returns 204 for unknown fragment name', () => {
    const res = createMockRes();
    handler(createMockReq('GET', { name: 'unknown', id: '1' }), res as unknown as NextApiResponse);
    assert.strictEqual(res._status, 204);
    assert.strictEqual(res._body, '');
  });

  test('POST returns 405 Method Not Allowed', () => {
    const res = createMockRes();
    handler(createMockReq('POST', { name: 'demo', id: '1' }), res as unknown as NextApiResponse);
    assert.strictEqual(res._status, 405);
  });
  ```

---

## 5. Verification Method

To independently verify the defensive guidelines and implementation readiness:

1. **Verify TypeScript Compilation with `exactOptionalPropertyTypes`**:
   ```bash
   rtk npx tsc --noEmit --exactOptionalPropertyTypes
   ```
   *Expected*: Passes with 0 errors after `types/index.ts` is updated.
2. **Verify Unit Tests Run with Native Test Runner**:
   ```bash
   cd apps/remote-app && rtk npx tsx --test test/next-config.test.ts test/health.test.ts test/fragmento.test.ts
   ```
   *Expected*: All 3 test files execute and pass without `expect is not defined` errors.
3. **Verify Zero Federation Remnants**:
   ```bash
   rtk rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/remote-app/
   ```
   *Expected*: Returns 0 matches.
4. **Verify Static Invariants (Tier 1 & Tier 2)**:
   ```bash
   node scripts/smoke-test.mjs --static
   # or direct runner:
   node test/e2e/static-invariants.mjs
   ```
   *Expected*: `STATIC-01`, `STATIC-02`, `STATIC-05`, and `STATIC-07` all PASS.
5. **Verify Live HTTP Liveness & Routing (Port 3001)**:
   With `pnpm --filter remote-app dev` running:
   ```bash
   curl -i http://localhost:3001/remote-app/api/health
   # Expected: HTTP/1.1 200 OK, {"ok":true}

   curl -i http://localhost:3001/remote-app/_fragmento/demo/42
   # Expected: HTTP/1.1 200 OK, Content-Type: text/html; charset=utf-8, body contains <div class="fragment fragment--demo"><p>Demo fragment (id: 42)</p></div>

   curl -i http://localhost:3001/remote-app/_fragmento/unknown/1
   # Expected: HTTP/1.1 204 No Content, Content-Length: 0

   curl -i -X POST http://localhost:3001/remote-app/_fragmento/demo/1
   # Expected: HTTP/1.1 405 Method Not Allowed
   ```
