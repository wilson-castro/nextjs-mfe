# Milestone 2 Configuration & Deprecated Files Implementation Specification

**Author:** Milestone 2 Configuration & Deletion Explorer (`explorer_m2_1`)  
**Parent Agent:** `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Date:** 2026-09-11  
**Scope:** Milestone 2 Configuration & Deprecated Files (`apps/host`) — Requirements R3 & R4  
**Target:** Implementation Specification for Worker Agent  

---

## 1. Observation

### 1.1 Direct Codebase & File Observations

1. **Deprecated Files Slated for Deletion in `apps/host`**:
   - `apps/host/lib/safeRemoteLoader.ts` (100 lines):
     - Implements `fetchRemoteServerData(apiUrl, timeoutMs, session)` doing direct HTTP requests to `http://localhost:3001/api/server-data` during SSR.
     - Line 2: `import type { ServerPayload } from 'remote/ServerCard';`
     - Only imported by `apps/host/pages/index.tsx` (line 8).
     - Violates the core Multi-Zones architecture rule: *"Shell NEVER contains a DAL or talks to any business domain directly"*.
   - `apps/host/components/FederatedErrorBoundary.tsx` (63 lines):
     - React error boundary specifically designed to catch client-side runtime errors when resolving federated remote chunks.
     - Line 4: `import RemoteFallbackCard from './RemoteFallbackCard';`
     - Imported by `apps/host/pages/index.tsx` (line 5) and `apps/host/components/RemoteCardClientWrapper.tsx` (line 5).
     - Obsolete under Multi-Zones: cross-zone navigation is native browser document navigation (`<a>`); remote page rendering is handled autonomously by Zone 2.
   - `apps/host/components/RemoteCardClientWrapper.tsx` (47 lines):
     - Client component performing `const RemoteServerCard = lazy(() => import('remote/ServerCard')...);`.
     - Line 4: `import type { ServerPayload } from 'remote/ServerCard';`
     - Not imported by any other active component (dead code from prior iteration).
     - Obsolete: host will never lazy-load remote components over Webpack Federation.
   - `apps/host/declarations.d.ts` (106 lines):
     - Ambient TypeScript declarations for Webpack remotes:
       - Line 1: `declare module 'remote/ServerCard'`
       - Line 36: `declare module 'remote/RemoteTelemetry'`
       - Line 50: `declare module 'remote/RemoteMap'`
       - Line 76: `declare module 'remote/RemoteDashboard'`
       - Line 96: `declare module 'remote/getServerData'`
       - Line 101: `declare module 'remote/events'`
     - Verified: This is the **only** file in the monorepo with `declare module` declarations.

2. **Additional Orphaned Federation File Identified**:
   - `apps/host/components/RemoteFallbackCard.tsx` (45 lines):
     - Renders `<div className="federated-card fallback-card">` with text `"The Host application is operating normally, but the requested remote component could not be loaded from port 3001."`
     - Currently imported by `pages/index.tsx`, `FederatedErrorBoundary.tsx`, and `RemoteCardClientWrapper.tsx`.
     - Listed in `PROJECT.md` line 86 as an explicitly owned deleted file for Milestone 2:
       `deleted files (safeRemoteLoader.ts, FederatedErrorBoundary.tsx, RemoteCardClientWrapper.tsx, declarations.d.ts, RemoteFallbackCard.tsx)`.
     - Once `pages/index.tsx` is rewritten to remove remote component rendering, `RemoteFallbackCard.tsx` becomes 100% dead code with zero imports.

3. **Standard Non-Federation Declarations**:
   - `apps/host/next-env.d.ts` (7 lines) contains only `/// <reference types="next" />`, `/// <reference types="next/image-types/global" />`, and `/// <reference path="./.next/types/routes.d.ts" />`. It contains NO federation references and must NOT be deleted.

4. **Current `apps/host/package.json`**:
   ```json
   {
     "name": "@mfe/host",
     "version": "1.0.0",
     "private": true,
     "scripts": {
       "dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3000",
       "build": "NEXT_PRIVATE_LOCAL_WEBPACK=true next build",
       "start": "next start -p 3000",
       "typecheck": "tsc --noEmit"
     },
     "dependencies": {
       "@module-federation/nextjs-mf": "^8.8.74",
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
   - Lacks `"test"` script.
   - Contains `NEXT_PRIVATE_LOCAL_WEBPACK=true` in `"dev"` and `"build"`.
   - Declares `"@module-federation/nextjs-mf": "^8.8.74"`.

5. **Current `apps/host/next.config.js`**:
   - 35 lines total.
   - Line 1: `const { NextFederationPlugin } = require('@module-federation/nextjs-mf');`
   - Lines 8–13: `getRemotes` function returning `remote@http://localhost:3001/_next/static/${location}/remoteEntry.js`.
   - Lines 18–31: `webpack(config, options)` pushing `new NextFederationPlugin(...)`.
   - Lacks `async rewrites()`.

6. **E2E and Static Invariant Smoke Test Results**:
   - Command: `node scripts/smoke-test.mjs --offline`
   - Results:
     - `STATIC-01` (Zero Module Federation references in `apps/`): FAIL due to 10 federation remnants across `apps/host` (`RemoteCardClientWrapper.tsx`, `declarations.d.ts`, `safeRemoteLoader.ts`, `next.config.js`, `package.json`, `pages/index.tsx`).
     - `STATIC-06` (Host `next.config.js` declares 3 rewrite rules: root, subroutes, static): FAIL with `"apps/host/next.config.js does not export async rewrites()"`.
   - Command: `rtk pnpm --filter remote-app test`
     - 13/13 tests pass using `npx tsx --test test/*.test.ts` with `node:test` and `node:assert/strict`.

---

## 2. Logic Chain

1. **From Architecture & Invariants to File Deletion**:
   - In Next.js Multi-Zones, Shell and Zones are independent processes communicating strictly via HTTP reverse proxying (`rewrites`) and native page navigation (`<a>`).
   - `safeRemoteLoader.ts` performs direct SSR fetching of remote business data, violating the Shell DAL exclusion invariant (F7, R4).
   - `FederatedErrorBoundary.tsx` and `RemoteCardClientWrapper.tsx` exist solely to catch and wrap client-side Webpack Module Federation chunk loading.
   - `declarations.d.ts` provides ambient types for Webpack Federation remote modules (`remote/*`).
   - Therefore, all four files (`safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `declarations.d.ts`) along with the orphaned `RemoteFallbackCard.tsx` must be removed from `apps/host`.

2. **From Module Federation Removal to `package.json` Cleanup**:
   - When Module Federation is eliminated, `@module-federation/nextjs-mf` is no longer imported by any host file or config.
   - The environment variable `NEXT_PRIVATE_LOCAL_WEBPACK=true` was an internal escape hatch specifically required by `@module-federation/nextjs-mf` to force Next.js 15 to use local Webpack instead of Turbopack or internal bundled Webpack. In native Multi-Zones, this flag is unnecessary and non-standard.
   - Adding `"test": "npx tsx --test test/*.test.ts"` aligns `apps/host` with `apps/remote-app` and enables automated verification of host routing and configuration.

3. **From Routing Requirements to `next.config.js` Rewrites**:
   - In Next.js, path matching rules behave as follows:
     - Route `/remote-app/:path*` matches paths with a sub-segment or trailing slash (`/remote-app/`, `/remote-app/api/health`), but does **not** reliably match the exact root path `/remote-app` without a trailing delimiter.
     - Therefore, **Rule 1** (`source: '/remote-app'`) is strictly required to route the zone root page without a 404.
     - **Rule 2** (`source: '/remote-app/:path*'`) routes all sub-pages, dynamic routes, and API endpoints (e.g. `/remote-app/api/health`, `/remote-app/_fragmento/demo/42`).
     - Zone 2 is configured with `assetPrefix: '/remote-app-static'` (to avoid collisions in the host's `/_next/` static namespace). Thus, **Rule 3** (`source: '/remote-app-static/:path*'`) proxies all static chunks, CSS, and media bundles to Zone 2.
   - Regarding environment variable configuration:
     - Both `REMOTE_APP_URL` (specified in USER_REQUEST) and `REMOTE_ZONE_URL` (specified in `docs/design-bff/mfe/01-operacao.md` and `PROJECT.md`) appear in documentation and scripts.
     - Defining `const remoteAppUrl = process.env.REMOTE_APP_URL || process.env.REMOTE_ZONE_URL || 'http://localhost:3001';` provides 100% compatibility with all tooling, CI environments, and manual overrides.

4. **From Inter-Module Dependencies to Execution Sequencing**:
   - `apps/host/pages/index.tsx` currently imports `safeRemoteLoader`, `FederatedErrorBoundary`, `RemoteFallbackCard`, and `remote/*` types from `declarations.d.ts`.
   - If the Worker deletes `declarations.d.ts` and `safeRemoteLoader.ts` without immediately rewriting `pages/index.tsx`, `tsc --noEmit` will fail on unresolved imports.
   - Therefore, the Worker must execute file deletion and `pages/index.tsx` refactoring in coordinated lockstep before running `tsc --noEmit`.

---

## 3. Caveats

1. **No Source Code Modified in Explorer Mode**: In strict compliance with the Explorer archetype, no source files, configuration files, or package definitions in `apps/host` were modified during this investigation.
2. **`RemoteFallbackCard.tsx` Deletion**: While `ORIGINAL_REQUEST.md` specifically calls out 4 files (`safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, and `declarations.d.ts`), `PROJECT.md` Milestone 2 file ownership explicitly includes `RemoteFallbackCard.tsx`. It becomes dead code and should be removed.
3. **Workspace-Level Overrides Deferred to M3**: Overrides in `pnpm-workspace.yaml` (`allowBuilds`, `onlyBuiltDependencies`, `overrides`) belong exclusively to Milestone 3 (F15 / R6) and must not be touched during Milestone 2.

---

## 4. Conclusion & Concrete Specification for Worker

### Specification 1: Deprecated Files to Delete

The Worker must execute the removal of these 5 files:
```bash
rm apps/host/lib/safeRemoteLoader.ts
rm apps/host/components/FederatedErrorBoundary.tsx
rm apps/host/components/RemoteCardClientWrapper.tsx
rm apps/host/declarations.d.ts
rm apps/host/components/RemoteFallbackCard.tsx
```

#### Detailed Verification of All Files in `apps/host`:
| File Path | Status | Rationale |
|-----------|--------|-----------|
| `apps/host/lib/safeRemoteLoader.ts` | **DELETE** | Node SSR fetch to remote; violates Shell DAL exclusion |
| `apps/host/components/FederatedErrorBoundary.tsx` | **DELETE** | Federation chunk error boundary; obsolete in Multi-Zones |
| `apps/host/components/RemoteCardClientWrapper.tsx` | **DELETE** | Lazy import of `remote/ServerCard`; obsolete |
| `apps/host/declarations.d.ts` | **DELETE** | Ambient types for `remote/*`; obsolete |
| `apps/host/components/RemoteFallbackCard.tsx` | **DELETE** | Orphaned fallback UI; 0 references once index.tsx is rewritten |
| `apps/host/next-env.d.ts` | **KEEP** | Standard Next.js auto-generated ambient types (NO federation content) |
| `apps/host/components/Header.tsx` | **KEEP (UPDATE)** | Update `HeaderProps` to remove mandatory `isRemoteAvailable` |
| `apps/host/components/HostLayout.tsx` | **KEEP (UPDATE)** | Update `HostLayoutProps` to remove `isRemoteAvailable` and `onTabSelect` |
| `apps/host/components/SideNavigation.tsx` | **KEEP (UPDATE)** | Replace tab navigation with `<a href="/">` and `<a href="/remote-app">` |
| `apps/host/components/ToastContainer.tsx` | **KEEP** | Standard custom event listener; unaffected |
| `apps/host/lib/events.ts`, `logger.ts`, `session.ts` | **KEEP** | Core shell infrastructure; unaffected |

---

### Specification 2: Modifications to `apps/host/package.json`

#### Exact Content for `apps/host/package.json`:
```json
{
  "name": "@mfe/host",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "test": "npx tsx --test test/*.test.ts"
  },
  "dependencies": {
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

#### Diff Summary:
- `"dev"`: `"NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3000"` → `"next dev -p 3000"`
- `"build"`: `"NEXT_PRIVATE_LOCAL_WEBPACK=true next build"` → `"next build"`
- `"start"`: `"next start -p 3000"` (retained as is)
- `"test"`: added `"npx tsx --test test/*.test.ts"`
- `"dependencies"`: removed `"@module-federation/nextjs-mf": "^8.8.74"`

---

### Specification 3: Multi-Zones Gateway Configuration in `apps/host/next.config.js`

#### Exact Content for `apps/host/next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const remoteAppUrl =
      process.env.REMOTE_APP_URL ||
      process.env.REMOTE_ZONE_URL ||
      'http://localhost:3001';

    return [
      // 1. Zone root: explicit match for /remote-app
      {
        source: '/remote-app',
        destination: `${remoteAppUrl}/remote-app`,
      },
      // 2. Zone sub-routes: matches all paths and endpoints under /remote-app/
      {
        source: '/remote-app/:path*',
        destination: `${remoteAppUrl}/remote-app/:path*`,
      },
      // 3. Zone static assets: matches static chunks and assets under /remote-app-static/
      {
        source: '/remote-app-static/:path*',
        destination: `${remoteAppUrl}/remote-app-static/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

#### Rationale for the 3 Rules:
1. `{ source: '/remote-app', destination: 'http://localhost:3001/remote-app' }`:
   Next.js route pattern `/remote-app/:path*` requires a path separator or child segment; it does **not** match requests targeting `/remote-app` directly. Rule 1 guarantees navigating to `/remote-app` renders the zone root index.
2. `{ source: '/remote-app/:path*', destination: 'http://localhost:3001/remote-app/:path*' }`:
   Proxies all sub-pages (`/remote-app/dashboard`), BFF endpoints (`/remote-app/api/health`), and fragments (`/remote-app/_fragmento/demo/42`) seamlessly to port 3001.
3. `{ source: '/remote-app-static/:path*', destination: 'http://localhost:3001/remote-app-static/:path*' }`:
   Zone 2 builds assets with `assetPrefix: '/remote-app-static'`. This rule isolates zone JS/CSS chunks from host assets, preventing 404s and runtime collisions on `/_next/static/*`.

---

### Specification 4: Test Suite `apps/host/test/rewrites.test.ts`

The Worker must create `apps/host/test/rewrites.test.ts` using Node's native test runner (`node:test` + `node:assert/strict`), which matches the project standard used in `apps/remote-app/test/next-config.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
}

interface NextConfigProperties {
  readonly reactStrictMode?: boolean | null | undefined;
  readonly rewrites?: (() => Promise<RewriteRule[] | { beforeFiles?: RewriteRule[]; afterFiles?: RewriteRule[]; fallback?: RewriteRule[] }>) | undefined;
  readonly default?: NextConfigProperties | undefined;
}

const rawConfig: NextConfigProperties = nextConfig;
const config: NextConfigProperties = rawConfig.default ?? rawConfig;

test('reactStrictMode is enabled', () => {
  assert.equal(config.reactStrictMode, true);
});

test('rewrites export is an async function', () => {
  assert.equal(typeof config.rewrites, 'function');
});

test('rewrites returns the 3 distinct multi-zone gateway rules', async () => {
  assert.ok(typeof config.rewrites === 'function');
  const rewritesResult = await config.rewrites!();
  const list: readonly RewriteRule[] = Array.isArray(rewritesResult)
    ? rewritesResult
    : (rewritesResult.beforeFiles ?? rewritesResult.afterFiles ?? []);

  const sources = list.map((r) => r.source);
  assert.ok(sources.includes('/remote-app'), 'Missing rewrite rule for /remote-app');
  assert.ok(sources.includes('/remote-app/:path*'), 'Missing rewrite rule for /remote-app/:path*');
  assert.ok(sources.includes('/remote-app-static/:path*'), 'Missing rewrite rule for /remote-app-static/:path*');
  assert.equal(list.length, 3, 'Expected exactly 3 rewrite rules');

  const rootRule = list.find((r) => r.source === '/remote-app');
  assert.equal(rootRule?.destination, 'http://localhost:3001/remote-app');

  const subRouteRule = list.find((r) => r.source === '/remote-app/:path*');
  assert.equal(subRouteRule?.destination, 'http://localhost:3001/remote-app/:path*');

  const staticRule = list.find((r) => r.source === '/remote-app-static/:path*');
  assert.equal(staticRule?.destination, 'http://localhost:3001/remote-app-static/:path*');
});

test('rewrites respects custom remote zone URL from environment variables', async () => {
  const originalAppUrl = process.env.REMOTE_APP_URL;
  const originalZoneUrl = process.env.REMOTE_ZONE_URL;
  try {
    process.env.REMOTE_APP_URL = 'http://custom-host:4000';
    const rewritesResult = await config.rewrites!();
    const list: readonly RewriteRule[] = Array.isArray(rewritesResult)
      ? rewritesResult
      : (rewritesResult.beforeFiles ?? rewritesResult.afterFiles ?? []);

    const rootRule = list.find((r) => r.source === '/remote-app');
    assert.equal(rootRule?.destination, 'http://custom-host:4000/remote-app');
  } finally {
    if (originalAppUrl === undefined) {
      delete process.env.REMOTE_APP_URL;
    } else {
      process.env.REMOTE_APP_URL = originalAppUrl;
    }
    if (originalZoneUrl === undefined) {
      delete process.env.REMOTE_ZONE_URL;
    } else {
      process.env.REMOTE_ZONE_URL = originalZoneUrl;
    }
  }
});
```

---

### Specification 5: Step-by-Step Implementation Sequence for Worker

To avoid breaking intermediate states, the Worker should execute in this precise order:

1. **Step 1: Create Test Directory & Test File**:
   - Create `apps/host/test/rewrites.test.ts` with the test code from Specification 4.
2. **Step 2: Update Configuration**:
   - Replace `apps/host/next.config.js` with the clean Multi-Zones config from Specification 3.
3. **Step 3: Update Package Manifest**:
   - Modify `apps/host/package.json` according to Specification 2.
4. **Step 4: Execute Rewrites Unit Test**:
   - Run `npx tsx --test test/rewrites.test.ts` in `apps/host` (must PASS).
5. **Step 5: Delete Deprecated Files**:
   - Delete `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `declarations.d.ts`, and `RemoteFallbackCard.tsx`.
6. **Step 6: Refactor UI Components (if assigned to this worker)**:
   - Rewrite `apps/host/pages/index.tsx` (remove remote imports & SSR DAL fetch; add `<a href="/remote-app">`).
   - Update `apps/host/components/HostLayout.tsx`, `SideNavigation.tsx`, and `Header.tsx`.
7. **Step 7: Verify TypeScript & Smoke Suite**:
   - Run `pnpm --filter @mfe/host typecheck` (`tsc --noEmit`).
   - Run `node scripts/smoke-test.mjs --offline`.

---

## 5. Verification Method

### 5.1 Unit Verification Commands

```bash
# 1. Run Host Rewrites Unit Tests
pnpm --filter @mfe/host test
# Or directly:
cd apps/host && npx tsx --test test/rewrites.test.ts

# 2. Verify TypeScript Compilation (once UI components are updated)
pnpm --filter @mfe/host typecheck

# 3. Check for Remaining Federation Tokens in apps/host
rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/host/
# Target: 0 matches once index.tsx is also rewritten
```

### 5.2 Offline Static Smoke Suite Verification

```bash
node scripts/smoke-test.mjs --offline
```
- **Target Status after M2 Config & Deletion**:
  - `STATIC-06` (Host rewrites config): **PASS** (previously FAIL).
  - `STATIC-01` (Zero Federation references): 8 out of 10 remnants removed (remaining 2 in `pages/index.tsx` are eliminated when `index.tsx` is updated).

### 5.3 Invalidation Conditions
- Any rewrite rule pointing to a hardcoded URL without respecting `REMOTE_APP_URL` / `REMOTE_ZONE_URL`.
- Missing `/remote-app` root rule causing 404 on zone index.
- Retaining `@module-federation/nextjs-mf` or `NEXT_PRIVATE_LOCAL_WEBPACK=true` in `apps/host/package.json`.
- Residual `remote/*` ambient declarations left in any `.d.ts` file in `apps/host`.
