# Milestone 2 Test Suite & Invariants Verification Report (R3, R4)

**Explorer:** Milestone 2 Test & Verification Explorer (`explorer_m2_3`)  
**Parent Agent:** `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Target:** `apps/host` Multi-Zones Rewrites, Deletion of Deprecated Files, Unit Test Suite & Static Invariants  
**Working Directory:** `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/explorer_m2_3`  
**Date:** 2026-09-11  

---

## 1. Observation

### 1.1 Baseline Workspace State
- **Milestone 1 Completion:** `apps/remote-app` is fully configured and operational:
  - `apps/remote-app/next.config.js` configures `basePath: '/remote-app'` and `assetPrefix: '/remote-app-static'`.
  - `apps/remote-app/tsconfig.json` has `exactOptionalPropertyTypes: true`.
  - Test runner executes with `npx tsx --test test/*.test.ts`: all 13 unit tests pass (`health.test.ts`, `fragmento.test.ts`, `next-config.test.ts`).
  - Production build `next build` passes in 1.6s with zero Webpack Module Federation plugins.
- **Milestone 2 Current Host Shell State (`apps/host`):**
  - `apps/host/next.config.js` (lines 1–35) requires `@module-federation/nextjs-mf` and injects `NextFederationPlugin` with dynamic `remoteEntry.js` resolution.
  - `apps/host/package.json` contains:
    - `"@module-federation/nextjs-mf": "^8.8.74"`
    - `"webpack": "5.90.3"`
    - `"dev": "NEXT_PRIVATE_LOCAL_WEBPACK=true next dev -p 3000"`
    - `"build": "NEXT_PRIVATE_LOCAL_WEBPACK=true next build"`
    - Lacks a `"test"` script.
  - `apps/host/tsconfig.json` includes `next-env.d.ts`, `**/*.ts`, `**/*.tsx` with `allowJs: true` and `incremental: true`.
  - `apps/host/tsconfig.tsbuildinfo` is present on disk and currently holds cached string tokens from Module Federation builds.

### 1.2 Deprecated Files on Disk
The following 5 deprecated/orphaned files exist on disk:
1. `apps/host/lib/safeRemoteLoader.ts` (100 lines) — direct Node HTTP client fetching remote server data during SSR.
2. `apps/host/components/FederatedErrorBoundary.tsx` (63 lines) — React error boundary catching federated module load failures.
3. `apps/host/components/RemoteCardClientWrapper.tsx` (47 lines) — wrapper executing dynamic `import('remote/ServerCard')`.
4. `apps/host/declarations.d.ts` (106 lines) — ambient declarations for `remote/*` modules.
5. `apps/host/components/RemoteFallbackCard.tsx` (45 lines) — fallback component orphaned once federated cards are removed.

Grep analysis revealed that `apps/host/pages/index.tsx` is the **only external file** importing `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, and `RemoteFallbackCard.tsx`. `RemoteCardClientWrapper.tsx` has zero incoming imports.

### 1.3 Static Invariants Check Baseline (`rtk node scripts/smoke-test.mjs --offline`)
Execution of the offline smoke test runner against current workspace yielded:
```text
  ✗ FAIL [STATIC-01] Zero Module Federation references in apps/
    Error: Found 10 federation remnants: apps/host/components/RemoteCardClientWrapper.tsx (contains "remote/ServerCard"), apps/host/declarations.d.ts (contains "remote/ServerCard"), apps/host/declarations.d.ts (contains "remote/RemoteDashboard"), apps/host/lib/safeRemoteLoader.ts (contains "remote/ServerCard"), apps/host/next.config.js (contains "@module-federation"), apps/host/next.config.js (contains "remoteEntry"), apps/host/next.config.js (contains "NextFederationPlugin"), apps/host/package.json (contains "@module-federation"), apps/host/pages/index.tsx (contains "remote/ServerCard"), apps/host/pages/index.tsx (contains "remote/RemoteDashboard")
  ✓ PASS [STATIC-02] tsconfig exactOptionalPropertyTypes: true in remote zone
  ✗ FAIL [STATIC-03] Cross-zone navigation uses plain <a> tags (no <Link>)
    Error: apps/host/pages/index.tsx: Expected content to contain "href="/remote-app""
  ✓ PASS [STATIC-04] Shell contains no DAL or database packages
  ✓ PASS [STATIC-05] Zone directory renamed to apps/remote-app with updated name
  ✗ FAIL [STATIC-06] Host next.config.js declares 3 rewrite rules (root, subroutes, static)
    Error: apps/host/next.config.js does not export async rewrites()
  ✓ PASS [STATIC-07] Remote zone next.config.js sets basePath and assetPrefix
```
Summary: 4 Passed, 3 Failed. All 3 failures (`STATIC-01`, `STATIC-03`, `STATIC-06`) reside strictly in `apps/host` and map directly to Milestone 2 deliverables.

### 1.4 Test Runner Environment
- Node version: `v26.8.1`.
- TSX version: `4.23.13` (available globally/via `npx tsx`).
- Native Node runner `node:test` and `node:assert/strict` are fully supported and execute without external test framework dependencies.

---

## 2. Logic Chain

1. **Routing Invariants to Next.js Rewrites:**
   - In Next.js path matching, `/remote-app/:path*` requires a path segment delimiter (`/`) and therefore does NOT match `/remote-app`.
   - To prevent 404 on the zone entry point, an explicit rewrite rule for `/remote-app` is mandatory.
   - Remote static chunks are served with `assetPrefix: '/remote-app-static'`. To avoid colliding with host chunks under `/_next/`, a dedicated rewrite rule `/remote-app-static/:path*` is mandatory.
   - Therefore, `apps/host/next.config.js` must implement exactly 3 rewrite rules: `/remote-app`, `/remote-app/:path*`, and `/remote-app-static/:path*`.

2. **Cross-Zone Navigation Invariants:**
   - Next.js `<Link>` component executes client-side SPA navigation (`pushState` + JSON data fetching). Because `apps/host` and `apps/remote-app` have completely separate bundles and runtimes, `<Link href="/remote-app">` crashes or renders 404 client-side.
   - Plain HTML `<a href="/remote-app">` triggers full browser document navigation, allowing the Host gateway to proxy the incoming request to the zone server.
   - Therefore, `pages/index.tsx` and `SideNavigation.tsx` must strictly use `<a href="/remote-app">` and contain zero `<Link>` elements targeting the remote zone.

3. **Shell Decoupling & File Deletions:**
   - Multi-Zones dictates that the shell gateway contains no Domain Access Layer (DAL) and performs no business domain I/O.
   - `safeRemoteLoader.ts` executed Node-to-Node SSR fetching; `FederatedErrorBoundary.tsx` and `RemoteCardClientWrapper.tsx` managed federated component loading.
   - Since `pages/index.tsx` will no longer render remote components directly, these 4 files (and `RemoteFallbackCard.tsx`) become completely obsolete.
   - Deleting these files directly resolves the 10 federation remnants reported by `STATIC-01`.

4. **Component Prop Ripple Effect:**
   - `Header.tsx` currently declares `readonly isRemoteAvailable: boolean` in `HeaderProps`.
   - `HostLayout.tsx` passes `isRemoteAvailable` to `Header`.
   - Removing SSR remote probing in `pages/index.tsx` eliminates `isRemoteAvailable`. If `HostLayout` drops the prop while `HeaderProps` still requires it, `tsc --noEmit` will fail.
   - Therefore, `Header.tsx`, `HostLayout.tsx`, and `SideNavigation.tsx` must be refactored simultaneously.

5. **Build Cache Trap:**
   - `apps/host/tsconfig.tsbuildinfo` caches previous compiler token states. Naive `rg` checks without file filters will match these cached tokens.
   - Removing `apps/host/tsconfig.tsbuildinfo` during cleanup ensures subsequent invariant greps pass cleanly.

---

## 3. Caveats

1. **Read-Only Explorer Archetype:** No source files in `apps/host` have been edited or created by this agent. All code provided in this report is a precise specification for the Worker agent.
2. **Environment Variable Fallback:** The rewrite destination must default to `http://localhost:3001` if `process.env.REMOTE_ZONE_URL` is undefined, but must prioritize `process.env.REMOTE_ZONE_URL` if set.
3. **Workspace-Level Package Purge (M3 Scope):** While `apps/host/package.json` removes `@module-federation/nextjs-mf` in M2, removal of root `pnpm-workspace.yaml` overrides belongs to M3. The Worker should run `pnpm install --no-frozen-lockfile` after updating `apps/host/package.json`.
4. **TypeScript Bundler Resolution:** In `apps/host/tsconfig.json`, `moduleResolution: "bundler"` and `allowJs: true` are enabled. Importing `../next.config.js` in `test/rewrites.test.ts` must account for CJS/ESM interop (`rawConfig.default ?? rawConfig`).

---

## 4. Conclusion & Worker Specification

The Worker agent must execute the following concrete changes:

### 4.1 Unit Test Suite Specification: `apps/host/test/rewrites.test.ts`
The Worker must create `apps/host/test/rewrites.test.ts` with explicit types (no `any`), Arrange-Act-Assert structure, and Node built-in imports:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.js';

interface RewriteRule {
  readonly source: string;
  readonly destination: string;
  readonly basePath?: false | undefined;
}

interface RewritesResultObject {
  readonly beforeFiles?: readonly RewriteRule[] | undefined;
  readonly afterFiles?: readonly RewriteRule[] | undefined;
  readonly fallback?: readonly RewriteRule[] | undefined;
}

type RewritesExport = () => Promise<readonly RewriteRule[] | RewritesResultObject>;

interface NextConfigModule {
  readonly rewrites?: RewritesExport | undefined;
  readonly default?: NextConfigModule | undefined;
}

const rawConfig: NextConfigModule = nextConfig as unknown as NextConfigModule;
const config: NextConfigModule = rawConfig.default ?? rawConfig;

test('next.config.js exports rewrites as an async function', () => {
  // Assert
  assert.equal(typeof config.rewrites, 'function', 'config.rewrites must be a function');
});

test('rewrites returns an array containing exactly 3 rewrite rules', async () => {
  // Arrange & Act
  assert.ok(config.rewrites, 'rewrites function must exist');
  const result = await config.rewrites();
  const rules: readonly RewriteRule[] = Array.isArray(result)
    ? result
    : (result.afterFiles ?? result.beforeFiles ?? []);

  // Assert
  assert.equal(rules.length, 3, `Expected exactly 3 rewrite rules, received ${rules.length}`);
});

test('rewrite rule 1 routes zone root /remote-app to port 3001 or REMOTE_ZONE_URL', async () => {
  // Arrange & Act
  assert.ok(config.rewrites, 'rewrites function must exist');
  const result = await config.rewrites();
  const rules: readonly RewriteRule[] = Array.isArray(result)
    ? result
    : (result.afterFiles ?? result.beforeFiles ?? []);

  const rootRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app');

  // Assert
  assert.ok(rootRule, 'Missing rewrite rule for source "/remote-app"');
  assert.ok(
    rootRule.destination === 'http://localhost:3001/remote-app' || rootRule.destination.endsWith('/remote-app'),
    `Destination must target /remote-app, got: ${rootRule.destination}`
  );
});

test('rewrite rule 2 routes zone sub-routes /remote-app/:path* to remote zone', async () => {
  // Arrange & Act
  assert.ok(config.rewrites, 'rewrites function must exist');
  const result = await config.rewrites();
  const rules: readonly RewriteRule[] = Array.isArray(result)
    ? result
    : (result.afterFiles ?? result.beforeFiles ?? []);

  const subRouteRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app/:path*');

  // Assert
  assert.ok(subRouteRule, 'Missing rewrite rule for source "/remote-app/:path*"');
  assert.ok(
    subRouteRule.destination === 'http://localhost:3001/remote-app/:path*' || subRouteRule.destination.endsWith('/remote-app/:path*'),
    `Destination must target /remote-app/:path*, got: ${subRouteRule.destination}`
  );
});

test('rewrite rule 3 routes zone static assets /remote-app-static/:path* to remote zone', async () => {
  // Arrange & Act
  assert.ok(config.rewrites, 'rewrites function must exist');
  const result = await config.rewrites();
  const rules: readonly RewriteRule[] = Array.isArray(result)
    ? result
    : (result.afterFiles ?? result.beforeFiles ?? []);

  const staticRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app-static/:path*');

  // Assert
  assert.ok(staticRule, 'Missing rewrite rule for source "/remote-app-static/:path*"');
  assert.ok(
    staticRule.destination === 'http://localhost:3001/remote-app-static/:path*' || staticRule.destination.endsWith('/remote-app-static/:path*'),
    `Destination must target /remote-app-static/:path*, got: ${staticRule.destination}`
  );
});

test('rewrites dynamically respects REMOTE_ZONE_URL environment variable override', async () => {
  // Arrange
  const originalEnv = process.env.REMOTE_ZONE_URL;
  process.env.REMOTE_ZONE_URL = 'http://custom-remote:9999';

  try {
    // Act
    assert.ok(config.rewrites, 'rewrites function must exist');
    const result = await config.rewrites();
    const rules: readonly RewriteRule[] = Array.isArray(result)
      ? result
      : (result.afterFiles ?? result.beforeFiles ?? []);

    const rootRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app');
    const subRouteRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app/:path*');
    const staticRule = rules.find((rule: RewriteRule) => rule.source === '/remote-app-static/:path*');

    // Assert
    assert.equal(rootRule?.destination, 'http://custom-remote:9999/remote-app');
    assert.equal(subRouteRule?.destination, 'http://custom-remote:9999/remote-app/:path*');
    assert.equal(staticRule?.destination, 'http://custom-remote:9999/remote-app-static/:path*');
  } finally {
    if (originalEnv !== undefined) {
      process.env.REMOTE_ZONE_URL = originalEnv;
    } else {
      delete process.env.REMOTE_ZONE_URL;
    }
  }
});
```

### 4.2 Configuration Specification: `apps/host/next.config.js`
Replace existing file with clean native Multi-Zones rewrites:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const remoteZoneUrl = process.env.REMOTE_ZONE_URL ?? 'http://localhost:3001';
    return [
      // Zone root — separate rule because /remote-app/:path* does NOT match /remote-app
      {
        source: '/remote-app',
        destination: `${remoteZoneUrl}/remote-app`,
      },
      // Zone sub-routes
      {
        source: '/remote-app/:path*',
        destination: `${remoteZoneUrl}/remote-app/:path*`,
      },
      // Zone static assets — separate prefix avoids /_next collisions
      {
        source: '/remote-app-static/:path*',
        destination: `${remoteZoneUrl}/remote-app-static/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

### 4.3 Package Manifest Specification: `apps/host/package.json`
Update scripts and dependencies:
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

### 4.4 Deprecated Files Deletion
Delete these files from `apps/host`:
```bash
rm -f apps/host/lib/safeRemoteLoader.ts
rm -f apps/host/components/FederatedErrorBoundary.tsx
rm -f apps/host/components/RemoteCardClientWrapper.tsx
rm -f apps/host/declarations.d.ts
rm -f apps/host/components/RemoteFallbackCard.tsx
rm -f apps/host/tsconfig.tsbuildinfo
```

### 4.5 Shell Component Updates
1. **`apps/host/pages/index.tsx`:**
   - Remove imports of `FederatedErrorBoundary`, `RemoteFallbackCard`, `safeRemoteLoader`, and `remote/*`.
   - Remove `fetchRemoteServerData` from `getServerSideProps` (Shell contains no DAL).
   - Render shell runtime diagnostics and `<a href="/remote-app" className="zone-link">→ Remote App Zone</a>`.
2. **`apps/host/components/Header.tsx`:**
   - Remove `isRemoteAvailable` from `HeaderProps`.
   - Update pill to `<span>Multi-Zones Shell (Port 3000)</span>`.
3. **`apps/host/components/HostLayout.tsx`:**
   - Simplify `HostLayoutProps` to `{ children: React.ReactNode; currentSession: UserSession; onSessionChange: (session: UserSession) => void; }`.
   - Remove `currentTab`, `isRemoteAvailable`, `onTabSelect`.
4. **`apps/host/components/SideNavigation.tsx`:**
   - Replace dynamic tab state and buttons with static links: `<a href="/" className="nav-link">` and `<a href="/remote-app" className="nav-link">`.
   - Remove "Module Federation v8" badge box.

---

## 5. Verification Method

To independently verify the implementation, execute the following commands in sequence:

### Step 1: Unit Test Suite
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host && rtk npx tsx --test test/rewrites.test.ts
```
*Expected Output:*
- All 6 tests pass:
  - `next.config.js exports rewrites as an async function`
  - `rewrites returns an array containing exactly 3 rewrite rules`
  - `rewrite rule 1 routes zone root /remote-app to port 3001 or REMOTE_ZONE_URL`
  - `rewrite rule 2 routes zone sub-routes /remote-app/:path* to remote zone`
  - `rewrite rule 3 routes zone static assets /remote-app-static/:path* to remote zone`
  - `rewrites dynamically respects REMOTE_ZONE_URL environment variable override`
- Exit code `0`.

### Step 2: TypeScript Cleanliness Check
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host && rtk tsc --noEmit
```
*Expected Output:*
- Zero TypeScript errors found (`TypeScript: No errors found`).
- Exit code `0`.

### Step 3: Deprecated Files Removal Check
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe && \
test ! -f apps/host/lib/safeRemoteLoader.ts && \
test ! -f apps/host/components/FederatedErrorBoundary.tsx && \
test ! -f apps/host/components/RemoteCardClientWrapper.tsx && \
test ! -f apps/host/declarations.d.ts && \
test ! -f apps/host/components/RemoteFallbackCard.tsx && echo "ALL_DEPRECATED_FILES_REMOVED"
```
*Expected Output:*
- Prints `ALL_DEPRECATED_FILES_REMOVED`.
- Exit code `0`.

### Step 4: Module Federation Zero-Remnant Grep Check
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe && \
rtk rg "@module-federation|remoteEntry|NextFederationPlugin|safeRemoteLoader" apps/host/
```
*Expected Output:*
- Returns 0 matches.
- Exit code `1` (ripgrep exits 1 when 0 matches found).

### Step 5: Offline Static Invariants Smoke Test
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe && rtk node scripts/smoke-test.mjs --offline
```
*Expected Output:*
- All static checks PASS:
  - `✓ PASS [STATIC-01] Zero Module Federation references in apps/`
  - `✓ PASS [STATIC-02] tsconfig exactOptionalPropertyTypes: true in remote zone`
  - `✓ PASS [STATIC-03] Cross-zone navigation uses plain <a> tags (no <Link>)`
  - `✓ PASS [STATIC-04] Shell contains no DAL or database packages`
  - `✓ PASS [STATIC-05] Zone directory renamed to apps/remote-app with updated name`
  - `✓ PASS [STATIC-06] Host next.config.js declares 3 rewrite rules (root, subroutes, static)`
  - `✓ PASS [STATIC-07] Remote zone next.config.js sets basePath and assetPrefix`
- Execution Summary: Total tests: 7, Passed: 7, Failed: 0.
- Exit code `0`.

### Step 6: Production Build Check
```bash
cd /home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host && rtk proxy pnpm run build
```
*Expected Output:*
- Production build succeeds without `NEXT_PRIVATE_LOCAL_WEBPACK=true`.
- Pages `/`, `/404`, `/500` generated cleanly.
- Exit code `0`.

### Invalidation Conditions
- Any rewrite rule missing from `next.config.js` (`/remote-app`, `/remote-app/:path*`, or `/remote-app-static/:path*`).
- Any `<Link>` used for cross-zone navigation in `pages/index.tsx` or `SideNavigation.tsx`.
- Any lingering reference to `@module-federation` or `safeRemoteLoader` in `apps/host`.
- Any remaining deprecated file on disk.
- Any TypeScript diagnostic error when executing `tsc --noEmit`.
