# Host Shell Codebase Investigation & Survey Report

**Author:** Host Shell Codebase Explorer (`survey_host_3`)  
**Parent Agent:** `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Date:** 2026-09-11  
**Target:** `apps/host` and Module Federation to Multi-Zones migration in `nextjs-mfe`  

---

## 1. Observation

### 1.1 Exact Matches of Module Federation Across the Codebase

Grep search across the workspace for `@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard` yielded the following locations:

#### Inside `apps/host/`:
1. `apps/host/declarations.d.ts` (106 lines total):
   - Line 1: `declare module 'remote/ServerCard' {`
   - Line 38: `import type { UserSession } from 'remote/ServerCard';`
   - Line 52: `import type { UserSession } from 'remote/ServerCard';`
   - Line 76: `declare module 'remote/RemoteDashboard' {`
   - Line 78: `import type { ServerPayload, UserSession } from 'remote/ServerCard';`
   - Line 96: `declare module 'remote/getServerData' {`
   - Line 101: `declare module 'remote/events' {`
2. `apps/host/next.config.js` (35 lines total):
   - Line 1: `const { NextFederationPlugin } = require('@module-federation/nextjs-mf');`
   - Line 5-6: comments referring to `remoteEntry.js` (`_next/static/ssr/remoteEntry.js` and `_next/static/chunks/remoteEntry.js`)
   - Line 11: `remote: 'remote@http://localhost:3001/_next/static/${location}/remoteEntry.js'`
   - Line 22: `new NextFederationPlugin({`
   - Line 24: `filename: 'static/chunks/remoteEntry.js',`
   - Line 25: `remotes: getRemotes(isServer),`
3. `apps/host/package.json`:
   - Line 6: `"dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3000"`
   - Line 7: `"build": "NEXT_PRIVATE_LOCAL_WEBPACK=true next build"`
   - Line 12: `"@module-federation/nextjs-mf": "^8.8.74"`
   - Line 16: `"webpack": "5.90.3"`
4. `apps/host/pages/index.tsx` (210 lines total):
   - Line 4: `import type { ServerPayload } from 'remote/ServerCard';`
   - Line 8: `import { fetchRemoteServerData } from '../lib/safeRemoteLoader';`
   - Line 12-28: `const RemoteDashboard = lazy(() => import('remote/RemoteDashboard')...);`
   - Line 166: `const serverData = await fetchRemoteServerData('http://localhost:3001/api/server-data', 800, session);`
5. `apps/host/components/RemoteCardClientWrapper.tsx` (47 lines total):
   - Line 4: `import type { ServerPayload } from 'remote/ServerCard';`
   - Line 9-19: `const RemoteServerCard = lazy(() => import('remote/ServerCard')...);`
6. `apps/host/lib/safeRemoteLoader.ts` (100 lines total):
   - Line 2: `import type { ServerPayload } from 'remote/ServerCard';`
   - Line 6-99: Direct HTTP client fetch to `http://localhost:3001/api/server-data` in host Node process during SSR.

#### Monorepo Root & Remote References:
1. `pnpm-workspace.yaml`:
   - Lines 4-5: `allowBuilds: { '@module-federation/nextjs-mf': true }`
   - Lines 7-11: `onlyBuiltDependencies: ['@module-federation/nextjs-mf', '@module-federation/enhanced', '@swc/core', 'webpack']`
   - Lines 13-15: `overrides: { enhanced-resolve: '5.17.1', webpack: '5.90.3' }`
2. `.npmrc`:
   - Line 3: `only-built-dependencies[]=@module-federation/nextjs-mf`
   - Line 4: `only-built-dependencies[]=@module-federation/enhanced`
3. `apps/remote/next.config.js`:
   - Line 1: `const { NextFederationPlugin } = require('@module-federation/nextjs-mf');`
   - Lines 8-10: `new NextFederationPlugin({ filename: 'static/chunks/remoteEntry.js', ... })`
4. `apps/remote/package.json`:
   - Line 12: `"@module-federation/nextjs-mf": "^8.8.74"`
5. `package.json` (root):
   - Line 22: `"webpack": "5.90.3"`

---

### 1.2 Deprecated Files in `apps/host` Slated for Deletion

The following 4 files are designated for immediate deletion in R4:
1. `apps/host/lib/safeRemoteLoader.ts` (100 lines) — Server-side HTTP fetch of remote card data; violates Multi-Zones shell principle (no DAL in shell).
2. `apps/host/components/FederatedErrorBoundary.tsx` (63 lines) — React error boundary built specifically to catch federated module load/hydration crashes.
3. `apps/host/components/RemoteCardClientWrapper.tsx` (47 lines) — Client wrapper executing dynamic `import('remote/ServerCard')`.
4. `apps/host/declarations.d.ts` (106 lines) — TypeScript ambient declarations for `remote/*` modules.

**Additional Orphaned File Detected:**
- `apps/host/components/RemoteFallbackCard.tsx` (45 lines) — Currently imported solely by `pages/index.tsx`, `RemoteCardClientWrapper.tsx`, and `FederatedErrorBoundary.tsx`. When `pages/index.tsx` is rewritten to remove federated remote rendering, `RemoteFallbackCard.tsx` has zero imports remaining in `apps/host`.

---

### 1.3 Host Pages and Components Requiring Updates

#### A. `apps/host/pages/index.tsx`
- **Current State:** Contains 210 lines. Imports `safeRemoteLoader`, `FederatedErrorBoundary`, `RemoteFallbackCard`, and lazy loads `remote/RemoteDashboard`. In `getServerSideProps`, issues an HTTP GET to `http://localhost:3001/api/server-data` with an 800ms timeout.
- **Target State:** Strip all remote imports, error boundaries, and `fetchRemoteServerData`. Remove domain data fetching from `getServerSideProps` (retain only `hostRenderTimestamp`, `initialSession`, `initialRoute`). Render shell runtime diagnostics and a plain anchor tag `<a href="/remote-app" className="zone-link">→ Remote App Zone</a>`. Pass only `currentSession` and `onSessionChange` to `HostLayout`.
- **Architectural Rule:** Cross-zone navigation must use native `<a>`, never Next.js `<Link>`. `<Link>` performs client-side soft navigation, which fails silently across distinct zone bundles.

#### B. `apps/host/components/HostLayout.tsx`
- **Current State:** `HostLayoutProps` has:
  ```typescript
  interface HostLayoutProps {
    readonly children: React.ReactNode;
    readonly currentTab: string;
    readonly currentSession: UserSession;
    readonly onSessionChange: (session: UserSession) => void;
    readonly isRemoteAvailable: boolean;
    readonly onTabSelect?: (tabId: string) => void;
  }
  ```
- **Target State:** Remove `currentTab`, `isRemoteAvailable`, and `onTabSelect`. Simplified `HostLayoutProps` accepts only `children`, `currentSession`, `onSessionChange`. Renders `<Header currentSession={currentSession} onSessionChange={onSessionChange} />`, `<SideNavigation />`, and children.

#### C. `apps/host/components/SideNavigation.tsx`
- **Current State:** Accepts `currentTab` and `onTabSelect`. Renders 4 tab buttons ('overview', 'telemetry', 'map', 'metrics') with `onClick={(e) => { e.preventDefault(); onTabSelect?.(item.id); }}` for client-side switching of federated views. Displays "Module Federation v8" badge in the footer.
- **Target State:** Remove tab switching state and props. Replace with static anchor tags:
  ```tsx
  <nav className="side-nav">
    <a href="/" className="nav-item">Shell Home</a>
    {/* cross-zone: <a> required — <Link> soft-navigates and fails silently across zones */}
    <a href="/remote-app" className="nav-item">Remote App</a>
  </nav>
  ```
  Remove the Module Federation footer badge.

#### D. `apps/host/components/Header.tsx` (Critical Ripple Effect)
- **Current State:**
  ```typescript
  interface HeaderProps {
    readonly currentSession: UserSession;
    readonly onSessionChange: (session: UserSession) => void;
    readonly isRemoteAvailable: boolean;
  }
  ```
  Header uses `isRemoteAvailable` to display:
  `<span className="status-dot ${isRemoteAvailable ? 'dot-online' : 'dot-offline'}" />`
  `Remote MFE (3001): {isRemoteAvailable ? 'Online' : 'Degraded'}`
- **Discrepancy / Risk:** If `HostLayout` omits `isRemoteAvailable` as planned (`<Header currentSession={currentSession} onSessionChange={onSessionChange} />`), TypeScript compilation will fail with:
  `Property 'isRemoteAvailable' is missing in type ... but required in type 'HeaderProps'`.
- **Target State:** Either make `isRemoteAvailable` optional (`isRemoteAvailable?: boolean`) or remove it from `HeaderProps` and update the system pill to avoid showing false degradation when Federation SSR is eliminated.

---

### 1.4 Multi-Zones Rewrites in `apps/host/next.config.js`

- **Replacement Architecture:** The Webpack hook and `NextFederationPlugin` are replaced by Next.js native `async rewrites()`.
- **Exact Configuration Required:**
  ```javascript
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    async rewrites() {
      const remoteZoneUrl = process.env.REMOTE_ZONE_URL ?? 'http://localhost:3001';
      return [
        // Zone root — separate from /:path* because /remote-app/:path* does NOT match /remote-app
        {
          source: '/remote-app',
          destination: `${remoteZoneUrl}/remote-app`,
        },
        // Zone sub-routes
        {
          source: '/remote-app/:path*',
          destination: `${remoteZoneUrl}/remote-app/:path*`,
        },
        // Zone static assets — separate prefix avoids /_next collision between zones
        {
          source: '/remote-app-static/:path*',
          destination: `${remoteZoneUrl}/remote-app-static/:path*`,
        },
      ];
    },
  };

  module.exports = nextConfig;
  ```
- **Rule Breakdown:**
  1. `/remote-app` → Proxies the zone root index page. Must be distinct because Next.js route matching requires a trailing delimiter for `:path*`.
  2. `/remote-app/:path*` → Proxies all zone sub-routes, pages, and BFF endpoints (e.g. `/remote-app/api/health`, `/remote-app/_fragmento/:name/:id`).
  3. `/remote-app-static/:path*` → Proxies static assets (JS chunks, CSS, media) built by the remote zone with `assetPrefix: '/remote-app-static'`. Bypasses host's `/_next/` namespace to eliminate asset collisions.

---

### 1.5 Test Setup Investigation & Empirical Verification

1. **Tooling in `apps/host`:**
   - No `jest` or `vitest` installed anywhere in `apps/host/package.json` or root `package.json`.
   - `apps/host/lib/logger.test.mjs` exists and executes with `node --test apps/host/lib/logger.test.mjs` using `import test from 'node:test'` and `import assert from 'node:assert/strict'`.
   - Node runtime: `v26.8.1` (has native `node:test` runner and built-in type stripping).
   - TypeScript: `v5.4.5`, `npx tsc --noEmit` currently passes.
   - `apps/host/package.json` currently lacks a `"test"` script.
2. **Empirical Finding on `test/rewrites.test.ts` from Implementation Plan:**
   - The test snippet proposed in `docs/superpowers/plans/2026-09-11-multizone-refactor.md` uses:
     ```typescript
     import nextConfig from '../next.config.js';
     test('rewrites export is a function', async () => {
       expect(typeof nextConfig.rewrites).toBe('function');
     });
     ```
   - **Verification Test Executed:** We ran an isolated test script with `npx tsx --test`.
     - Output: `ReferenceError: test is not defined` (if not imported).
     - When `test` is imported from `'node:test'`: `ReferenceError: expect is not defined`.
     - `npx tsx --test` delegates to Node's test runner, which does NOT provide Jest/Vitest's global `expect()`.
   - **Conclusion for Test Authoring:** `apps/host/test/rewrites.test.ts` must either:
     a) Use Node's standard assertion library (`import test from 'node:test'; import assert from 'node:assert/strict';`), which guarantees zero-dependency execution across both `node --test` and `tsx --test`; OR
     b) Provide a local helper/adapter for `expect`.

---

## 2. Logic Chain

1. **From Observation 1.1 to Module Federation Removal:**
   - `apps/host` relies on `declarations.d.ts` to declare ambient types for external Webpack Federation remotes (`remote/ServerCard`, `remote/RemoteDashboard`).
   - `apps/host/pages/index.tsx` and `RemoteCardClientWrapper.tsx` perform runtime dynamic imports (`import('remote/ServerCard')`, `import('remote/RemoteDashboard')`) that require Webpack runtime chunks resolved by `NextFederationPlugin`.
   - Multi-Zones replaces federated component sharing with independent HTTP-level zone integration.
   - Therefore, deleting `declarations.d.ts` makes all `remote/*` imports compile errors in TypeScript. All code importing from `remote/*` must be removed or rewritten simultaneously with the deletion of `declarations.d.ts`.

2. **From Observation 1.2 to Shell Decoupling:**
   - `apps/host/lib/safeRemoteLoader.ts` issues direct Node HTTP calls during SSR to fetch remote data.
   - In Multi-Zones, each zone is an autonomous application with its own BFF and data-fetching lifecycle. The host acts as a gateway/shell and does not execute domain data fetches.
   - Therefore, `safeRemoteLoader.ts` and `FederatedErrorBoundary.tsx` have no purpose in the Multi-Zones shell and must be eliminated.

3. **From Observation 1.3 to Navigation Invariants:**
   - Next.js `<Link>` components perform client-side SPA routing (fetching JSON data and rendering client bundles).
   - In Multi-Zones, `apps/host` and `apps/remote-app` have completely separate Webpack runtimes and asset bundles. A `<Link>` across zone boundaries triggers client-side route transitions that fail or 404 because the host client bundle does not contain the remote zone's page component.
   - Therefore, all cross-zone links in `pages/index.tsx` and `SideNavigation.tsx` must use plain `<a href="/remote-app">` tags to initiate full browser document navigations.

4. **From Observation 1.3 to Header Component Synchronization:**
   - `Header.tsx` interface `HeaderProps` marks `readonly isRemoteAvailable: boolean` as mandatory.
   - `HostLayout.tsx` renders `<Header>` and passes props to it.
   - If `HostLayout` removes `isRemoteAvailable` without updating `Header.tsx`, `tsc --noEmit` will fail.
   - Therefore, `Header.tsx` must be updated in tandem with `HostLayout.tsx`.

5. **From Observation 1.4 to Rewrites Implementation:**
   - Remote zone serves under `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`.
   - Host shell at port 3000 receives user requests. For the host to serve the remote zone transparently, it must proxy root `/remote-app`, sub-paths `/remote-app/:path*`, and static chunks `/remote-app-static/:path*` to port 3001.
   - Therefore, the 3-rule rewrite structure in `next.config.js` is both necessary and sufficient.

6. **From Observation 1.5 to Test Strategy:**
   - Because neither `jest` nor `vitest` is installed, and `apps/host/lib/logger.test.mjs` already standardizes on `node:test` + `node:assert/strict`, authoring `test/rewrites.test.ts` with `node:test` and `node:assert/strict` guarantees that the test runs immediately with zero additional dependencies, passes under `node --test` or `npx tsx --test`, and satisfies Acceptance Criterion R3.

---

## 3. Caveats

1. **No Source Code Changes Applied:** In accordance with the Explorer archetype rules, no source code, configuration files, or tests have been created or modified in `apps/host/` during this investigation.
2. **Orphaned `RemoteFallbackCard.tsx`:** While `ORIGINAL_REQUEST.md` specifically mandates deleting `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, and `declarations.d.ts`, `RemoteFallbackCard.tsx` was not explicitly enumerated in R4. However, it becomes dead code once `pages/index.tsx` is updated.
3. **Workspace-level Dependency Removal Timing:** Removing `@module-federation/nextjs-mf` from `apps/host/package.json` and `pnpm-workspace.yaml` must occur in coordination with `apps/remote-app`, otherwise running `pnpm install` midway through could cause workspace lockfile conflicts if one package still declares the dependency.

---

## 4. Conclusion

The transition of `apps/host` from Module Federation to Next.js Multi-Zones requires specific, well-bounded changes across 8 files:

1. **Delete 4 files:**
   - `apps/host/declarations.d.ts`
   - `apps/host/lib/safeRemoteLoader.ts`
   - `apps/host/components/FederatedErrorBoundary.tsx`
   - `apps/host/components/RemoteCardClientWrapper.tsx`
2. **Rewrite 1 configuration file:**
   - `apps/host/next.config.js` (replace Webpack federation plugin with 3 rewrite rules).
3. **Update 4 UI/shell components:**
   - `apps/host/pages/index.tsx` (remove federated lazy imports and SSR data fetch; add `<a href="/remote-app">`).
   - `apps/host/components/HostLayout.tsx` (clean props, remove federation availability).
   - `apps/host/components/SideNavigation.tsx` (use plain `<a>` for `/` and `/remote-app`; remove MF badge).
   - `apps/host/components/Header.tsx` (remove required `isRemoteAvailable` prop).
4. **Update package dependencies:**
   - `apps/host/package.json`: remove `@module-federation/nextjs-mf` and unnecessary `NEXT_PRIVATE_LOCAL_WEBPACK=true` script flags.
5. **Create 1 test suite:**
   - `apps/host/test/rewrites.test.ts` (using `node:test` + `node:assert/strict` to verify `rewrites()` returns `/remote-app`, `/remote-app/:path*`, `/remote-app-static/:path*`).

---

## 5. Verification Method

### 5.1 Verification Commands for the Implementation Agent

1. **Rewrites Unit Test:**
   ```bash
   cd apps/host && npx tsx --test test/rewrites.test.ts
   # or with Node native test runner:
   cd apps/host && node --test test/rewrites.test.ts
   ```
   *Expected Result:* All tests PASS.

2. **TypeScript Cleanliness:**
   ```bash
   cd apps/host && npx tsc --noEmit
   ```
   *Expected Result:* Zero errors.

3. **Module Federation Remnants Check:**
   ```bash
   rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/
   ```
   *Expected Result:* Zero matches in `apps/`.

4. **End-to-End Rewrites Verification (Smoke Test):**
   With `remote-app` running on port 3001 and `host` running on port 3000:
   ```bash
   curl -I http://localhost:3000/
   # Returns 200 OK (Host shell)

   curl -I http://localhost:3000/remote-app
   # Returns 200 OK (proxied from remote-app)

   curl -I http://localhost:3000/remote-app/api/health
   # Returns 200 OK with {"ok":true}
   ```

### 5.2 Reference Code for `apps/host/test/rewrites.test.ts`

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

test('rewrites export is a function', async () => {
  assert.strictEqual(typeof nextConfig.rewrites, 'function');
});

test('rewrites include zone root, sub-routes, and static assets', async () => {
  assert.ok(typeof nextConfig.rewrites === 'function');
  const rewrites = await nextConfig.rewrites();
  const list = Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles ?? [];
  const sources = list.map((r: { source: string }) => r.source);

  assert.ok(sources.includes('/remote-app'), 'Missing rewrite for /remote-app');
  assert.ok(sources.includes('/remote-app/:path*'), 'Missing rewrite for /remote-app/:path*');
  assert.ok(sources.includes('/remote-app-static/:path*'), 'Missing rewrite for /remote-app-static/:path*');
});
```
