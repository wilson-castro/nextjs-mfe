# Milestone 1 (Remote App Zone: R1, R2, R5) Worker Implementation Specification

**Role**: Milestone 1 Spec & Strategy Explorer  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m1_1`  
**Parent Agent Conversation ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Target Milestone**: Milestone 1 (Remote App Zone: R1, R2, R5)  
**Target Codebase Paths**: `apps/remote` → `apps/remote-app`, root `package.json`  

---

## 1. Observation

Direct observations from codebase inspection and verification commands:

### 1.1 Existing Directory & File Structure
- `apps/remote` is currently a Next.js 15.1.7 Pages Router application.
- `apps/remote/package.json` (lines 1–26):
  ```json
  {
    "name": "@mfe/remote",
    "version": "1.0.0",
    "private": true,
    "scripts": {
      "dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3001",
      "build": "NEXT_PRIVATE_LOCAL_WEBPACK=true next build",
      "start": "next start -p 3001",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@module-federation/nextjs-mf": "^8.8.74",
      "maplibre-gl": "^6.6.0",
      "next": "^15.1.7",
      "react": "18.3.1",
      "react-dom": "18.3.1",
      "webpack": "5.90.3"
    },
    "devDependencies": {
      "@types/node": "^20.14.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "typescript": "^5.4.5"
    }
  }
  ```
- `apps/remote/next.config.js` (lines 1–25):
  - Imports `NextFederationPlugin` from `@module-federation/nextjs-mf` (line 1).
  - Emits `static/chunks/remoteEntry.js` (line 10).
  - Exposes 6 federation endpoints (`./ServerCard`, `./RemoteMap`, `./RemoteTelemetry`, `./RemoteDashboard`, `./getServerData`, `./events`).
- Root `package.json` (lines 6, 9, 12, 15):
  ```json
  "dev:remote": "pnpm --filter @mfe/remote dev",
  "build:remote": "pnpm --filter @mfe/remote build",
  "start:remote": "pnpm --filter @mfe/remote start",
  "typecheck": "pnpm --filter @mfe/remote typecheck && pnpm --filter @mfe/host typecheck",
  ```
- Root `pnpm-workspace.yaml` (lines 1–3):
  ```yaml
  packages:
    - 'apps/*'
  ```
  The wildcard pattern `apps/*` discovers any directory under `apps/` automatically upon renaming `apps/remote` to `apps/remote-app`.

### 1.2 Verbatim Federation Grep Matches
Executing `grep_search` on `apps/remote/` for `@module-federation|remoteEntry`:
- `apps/remote/next.config.js:1`: `const { NextFederationPlugin } = require('@module-federation/nextjs-mf');`
- `apps/remote/next.config.js:10`: `filename: 'static/chunks/remoteEntry.js',`
- `apps/remote/package.json:12`: `"@module-federation/nextjs-mf": "^8.8.74",`
No other files in `apps/remote` reference `@module-federation` or `remoteEntry`.

### 1.3 Verbatim TS2375 Compiler Errors on `exactOptionalPropertyTypes`
Executing `tsc --noEmit --exactOptionalPropertyTypes true` in `apps/remote` produced 5 verbatim errors in `components/RemoteDashboard.tsx`:
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
```

### 1.4 Test Infrastructure
- Monorepo uses Node.js v26.8.1 with `node:test` and `node:assert/strict`.
- `apps/remote/lib/logger.test.mjs` executes natively via `npx tsx --test apps/remote/lib/logger.test.mjs` (2 passed).
- There is no Jest or Vitest installation; tests must use `node:test` and `node:assert/strict`.

---

## 2. Logic Chain

### 2.1 Directory Rename & Package Alignment (R1)
1. Moving `apps/remote` to `apps/remote-app` via `git mv` preserves Git file history.
2. In `apps/remote-app/package.json`, updating `"name": "remote-app"` aligns package identity with the architecture spec and plan.
3. Because root `package.json` targets scripts via `--filter @mfe/remote`, changing package name requires updating lines 6, 9, 12, 15 of root `package.json` to `--filter remote-app`. Otherwise, `pnpm dev:remote`, `pnpm build:remote`, `pnpm start:remote`, and `pnpm typecheck` fail with `No projects matched the filters`.
4. Removing `@module-federation/nextjs-mf` from `apps/remote-app/package.json` eliminates Webpack federation coupling.
5. Removing `NEXT_PRIVATE_LOCAL_WEBPACK=true` from `dev` and `build` scripts removes the environment flag previously required only by `nextjs-mf`.
6. Running `pnpm install` refreshes monorepo package resolution and updates node_modules symlinks.

### 2.2 Zone Configuration & Underscore Routing Solution (R2 & R5)
1. Multi-Zones zone specification requires `apps/remote-app/next.config.js` to define:
   - `basePath: '/remote-app'`
   - `assetPrefix: '/remote-app-static'`
   - `reactStrictMode: true`
2. Next.js Pages Router Invariant: Folders and files in `pages/` beginning with `_` (such as `pages/_fragmento/`) are treated as framework internal routes and are completely ignored by the file-system router. Moreover, non-API files in `pages/` are treated as React components, not HTTP route handlers.
3. Therefore:
   - Unit tests import handler directly from `pages/_fragmento/[name]/[id]`, which passes in-memory testing.
   - For runtime HTTP requests (`GET /remote-app/_fragmento/:name/:id`), Next.js router would 404 without a routing bridge.
   - Solution: Create `pages/api/fragmento/[name]/[id].ts` which re-exports `pages/_fragmento/[name]/[id].tsx`.
   - In `apps/remote-app/next.config.js`, declare `async rewrites()`:
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
   - Since `basePath: '/remote-app'` applies to rewrites by default, `/remote-app/_fragmento/:name/:id` is internally routed to `/remote-app/api/fragmento/:name/:id`, seamlessly satisfying both unit test import paths and real HTTP smoke tests.

### 2.3 Strict Typing with `exactOptionalPropertyTypes` (R2)
1. Adding `"exactOptionalPropertyTypes": true` to `apps/remote-app/tsconfig.json` tells TypeScript that optional fields `field?: T` do not accept explicit `undefined` (`{ field: undefined }`).
2. `components/RemoteDashboard.tsx` passes `serverData || undefined`, `queryParams?.lat`, and `session` (which can be `undefined`).
3. Updating `types/index.ts` to append `| undefined` on optional properties in `ServerCardProps`, `RemoteMapProps`, `RemoteTelemetryProps`, and `ServerPayload` allows both omitted keys and keys explicitly assigned `undefined`.
4. This completely resolves all 5 TS2375 compiler errors while maintaining 100% backward compatibility with existing components and preserving type safety.

### 2.4 Health Check Contract (R5)
1. Located at `apps/remote-app/pages/api/health.ts`.
2. Under `basePath: '/remote-app'`, this serves `GET /remote-app/api/health`.
3. Process liveness invariant: Responds immediately with HTTP 200 and JSON `{ ok: true }`. Performs zero DB, Redis, or external network I/O to prevent healthy containers from failing liveness probes during downstream dependency downtime.

### 2.5 Fragment Endpoint Contract (R5)
1. Located at `apps/remote-app/pages/_fragmento/[name]/[id].tsx`.
2. Contract Rules:
   - Method check: If `req.method !== 'GET'`, respond with HTTP 405 Method Not Allowed (`res.status(405).end()`).
   - Whitelist validation: `KNOWN_FRAGMENTS = new Set(['demo'])`.
   - If `!name || !KNOWN_FRAGMENTS.has(name)`, respond with HTTP 204 No Content (`res.status(204).end()`).
   - Unified Error Masking: HTTP 204 is returned for both unknown fragments and unauthorized requests (preserves "ausência total" so callers cannot distinguish 403 from 404).
   - Sanitization: `safeId = encodeURIComponent(String(id ?? ''))`.
   - Content-Type: `res.setHeader('Content-Type', 'text/html; charset=utf-8')`.
   - Inert HTML: `<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`. Contains zero `<script>` tags, zero event handlers, no dynamic client runtime.

---

## 3. Caveats

1. **Pages Router Underscore Routing**: As established in Logic Chain 2.2, `pages/_fragmento` will return 404 over HTTP unless `pages/api/fragmento/[name]/[id].ts` and the `next.config.js` rewrite are both implemented. Worker must create both files.
2. **`pnpm-workspace.yaml` Overrides**: `pnpm-workspace.yaml` still contains Federation-related `onlyBuiltDependencies` and `allowBuilds`. These are scheduled for cleanup in Milestone 3, so Worker should not touch `pnpm-workspace.yaml` in Milestone 1.
3. **No Jest/Vitest in Repository**: Test files must strictly use `import test from 'node:test'` and `import assert from 'node:assert/strict'`. Do not use `describe`, `it`, or `expect` as global identifiers.
4. **Read-Only Scope of Explorer**: This report provides ready-to-use code for the Worker agent. No source code has been modified in this turn.

---

## 4. Conclusion & Concrete Worker Implementation Specification

The Worker implementing Milestone 1 must follow these exact step-by-step tasks in order:

### Task 1: Directory Rename and Workspace Scripts Update

#### Step 1.1: Git Move
Run from monorepo root:
```bash
git mv apps/remote apps/remote-app
```

#### Step 1.2: Update `apps/remote-app/package.json`
Replace `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/package.json` with:
```json
{
  "name": "remote-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "typecheck": "tsc --noEmit",
    "test": "npx tsx --test test/*.test.ts"
  },
  "dependencies": {
    "maplibre-gl": "^6.6.0",
    "next": "^15.1.7",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "webpack": "5.90.3"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.5"
  }
}
```

#### Step 1.3: Update Root `package.json`
In `/home/gabrigas/Selene/Adventure/nextjs-mfe/package.json`, update script lines 6, 9, 12, 15:
```json
    "dev:remote": "pnpm --filter remote-app dev",
    "dev:host": "pnpm --filter @mfe/host dev",
    "dev": "concurrently -k -p \"[{name}]\" -n \"REMOTE,HOST\" -c \"cyan,magenta\" \"pnpm dev:remote\" \"pnpm dev:host\"",
    "build:remote": "pnpm --filter remote-app build",
    "build:host": "pnpm --filter @mfe/host build",
    "build": "pnpm build:remote && pnpm build:host",
    "start:remote": "pnpm --filter remote-app start",
    "start:host": "pnpm --filter @mfe/host start",
    "start": "concurrently -k -p \"[{name}]\" -n \"REMOTE,HOST\" -c \"cyan,magenta\" \"pnpm start:remote\" \"pnpm start:host\"",
    "typecheck": "pnpm --filter remote-app typecheck && pnpm --filter @mfe/host typecheck",
```

#### Step 1.4: Refresh Monorepo Workspace
Run from monorepo root:
```bash
pnpm install
```

---

### Task 2: Multi-Zones Configuration & Routing Bridge

#### Step 2.1: Author `apps/remote-app/next.config.js`
Replace `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/next.config.js` with:
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

#### Step 2.2: Unit Test `apps/remote-app/test/next-config.test.ts`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/test/next-config.test.ts`:
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

test('basePath is /remote-app', () => {
  assert.equal(nextConfig.basePath, '/remote-app');
});

test('assetPrefix is /remote-app-static', () => {
  assert.equal(nextConfig.assetPrefix, '/remote-app-static');
});

test('reactStrictMode is true', () => {
  assert.equal(nextConfig.reactStrictMode, true);
});

test('internal rewrites configure _fragmento route', async () => {
  assert.equal(typeof nextConfig.rewrites, 'function');
  const rewrites = await nextConfig.rewrites!();
  const list = Array.isArray(rewrites) ? rewrites : (rewrites.afterFiles ?? rewrites.beforeFiles ?? []);
  const fragmentRewrite = list.find((r: { source: string }) => r.source === '/_fragmento/:name/:id');
  assert.ok(fragmentRewrite, 'Must contain rewrite for /_fragmento/:name/:id');
  assert.equal(fragmentRewrite?.destination, '/api/fragmento/:name/:id');
});
```

---

### Task 3: TypeScript Configuration & Type Alignment

#### Step 3.1: Update `apps/remote-app/tsconfig.json`
Replace `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

#### Step 3.2: Update `apps/remote-app/types/index.ts`
Replace `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/types/index.ts` with:
```typescript
export interface UserSession {
  readonly userId: string;
  readonly userName: string;
  readonly email: string;
  readonly role: 'admin' | 'operator' | 'viewer';
  readonly tenant: string;
}

export interface ServerMetrics {
  readonly cpuArch: string;
  readonly platform: string;
  readonly memoryUsageMb: number;
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

export interface TelemetryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly level: 'info' | 'warn' | 'critical';
  readonly source: string;
  readonly message: string;
  readonly value: number;
}

export interface MapMarker {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly status: 'active' | 'warning' | 'idle';
  readonly description: string;
}

export interface ToastPayload {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly type: 'info' | 'success' | 'warning' | 'error';
  readonly timestamp: number;
}

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
  readonly filterLevel?: 'all' | 'info' | 'warn' | 'critical' | undefined;
  readonly maxEvents?: number | undefined;
  readonly session?: UserSession | undefined;
}
```

---

### Task 4: Health Check Endpoint Implementation & Test

#### Step 4.1: Create `apps/remote-app/pages/api/health.ts`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/pages/api/health.ts`:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export interface HealthResponse {
  readonly ok: boolean;
}

// Process liveness check — strictly no domain I/O, no DB/Redis dependencies.
export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
): void {
  res.status(200).json({ ok: true });
}
```

#### Step 4.2: Unit Test `apps/remote-app/test/health.test.ts`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/test/health.test.ts`:
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/api/health';

type MockRes = {
  _status: number;
  _body: unknown;
  status: (n: number) => MockRes;
  json: (b: unknown) => void;
};

function createMockRes(): MockRes {
  const res: MockRes = {
    _status: 0,
    _body: undefined,
    status(n: number) {
      res._status = n;
      return res;
    },
    json(b: unknown) {
      res._body = b;
    },
  };
  return res;
}

test('returns 200 { ok: true }', () => {
  const res = createMockRes();
  handler({} as NextApiRequest, res as unknown as NextApiResponse);
  assert.equal(res._status, 200);
  assert.deepEqual(res._body, { ok: true });
});
```

---

### Task 5: Fragment Endpoint Implementation, API Re-export & Test

#### Step 5.1: Create `apps/remote-app/pages/_fragmento/[name]/[id].tsx`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/pages/_fragmento/[name]/[id].tsx`:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

// Known fragment names exposed by this zone.
// ponytail: ACL check stubbed for Rodada 1. Wire criarFragmento(@erp/nucleo) in Rodada 2.
const KNOWN_FRAGMENTS = new Set<string>(['demo']);

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const { name, id } = req.query as { name?: string; id?: string };

  if (!name || !KNOWN_FRAGMENTS.has(name)) {
    // 204 represents both "not authorized" and "nothing to show" — caller cannot distinguish
    res.status(204).end();
    return;
  }

  const safeId = encodeURIComponent(String(id ?? ''));

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    // Inert HTML: strictly no <script> tags or inline event handlers
    .end(`<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`);
}
```

#### Step 5.2: Create `apps/remote-app/pages/api/fragmento/[name]/[id].ts`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/pages/api/fragmento/[name]/[id].ts`:
```typescript
import handler from '../../../_fragmento/[name]/[id]';

export default handler;
```

#### Step 5.3: Unit Test `apps/remote-app/test/fragmento.test.ts`
Create `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app/test/fragmento.test.ts`:
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
    status(n) {
      r._status = n;
      return r;
    },
    setHeader(k, v) {
      r._headers[k] = v;
      return r;
    },
    end(b = '') {
      r._body = b;
    },
  };
  return r;
}

function createMockReq(method: string, query: Record<string, string>): NextApiRequest {
  return { method, query } as unknown as NextApiRequest;
}

test('GET returns 200 text/html for known fragment name without <script>', () => {
  const res = createMockRes();
  handler(createMockReq('GET', { name: 'demo', id: '1' }), res as unknown as NextApiResponse);
  assert.equal(res._status, 200);
  assert.match(res._headers['Content-Type'], /text\/html/);
  assert.doesNotMatch(res._body, /<script/i);
  assert.match(res._body, /fragment--demo/);
});

test('GET returns 204 for unknown fragment name', () => {
  const res = createMockRes();
  handler(createMockReq('GET', { name: 'unknown', id: '1' }), res as unknown as NextApiResponse);
  assert.equal(res._status, 204);
  assert.equal(res._body, '');
});

test('POST returns 405', () => {
  const res = createMockRes();
  handler(createMockReq('POST', { name: 'demo', id: '1' }), res as unknown as NextApiResponse);
  assert.equal(res._status, 405);
});
```

---

## 5. Verification Method

The Worker and reviewer can independently verify Milestone 1 completion with the following commands:

1. **Verify Unit Test Suite**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app && rtk npx tsx --test test/*.test.ts
   ```
   **Expected Output**: All tests in `next-config.test.ts`, `health.test.ts`, and `fragmento.test.ts` PASS with zero failures.

2. **Verify TypeScript Typechecking with `exactOptionalPropertyTypes`**:
   ```bash
   cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote-app && rtk tsc --noEmit
   ```
   **Expected Output**: Clean exit (exit code 0), 0 errors reported.

3. **Verify Zero Grep Matches for Federation in `apps/remote-app`**:
   ```bash
   rtk grep "@module-federation|remoteEntry|NextFederationPlugin" apps/remote-app/
   ```
   **Expected Output**: Zero matches.

4. **Verify Workspace Script Health**:
   ```bash
   pnpm --filter remote-app typecheck
   ```
   **Expected Output**: Clean execution with exit code 0.

5. **Invalidation Conditions**:
   - If `tsc --noEmit` fails with TS2375, check that all optional properties in `types/index.ts` include `| undefined`.
   - If `apps/remote-app/test/fragmento.test.ts` fails on 204, check that `res.status(204).end()` does not send a body.
   - If `pnpm dev:remote` fails with missing package, check that `apps/remote-app/package.json` `"name"` is `"remote-app"` and root `package.json` matches `--filter remote-app`.
