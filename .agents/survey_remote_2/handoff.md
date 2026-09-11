# Remote Zone Codebase Survey & Multi-Zones Refactoring Plan (R1, R2, R5)

**Role**: Remote Zone Codebase Explorer  
**Working Directory**: `/home/gabrigas/Selene/Adventure/nextjs-mfe/.agents/survey_remote_2`  
**Target Zone**: `apps/remote` → `apps/remote-app`  
**Parent Agent ID**: `012e9e76-2bff-4cfd-a734-2b498b65bab2`  

---

## 1. Observation

### 1.1 `apps/remote` Directory Structure & File Inventory
A complete scan of `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/remote` (excluding `node_modules/` and `.next/`) revealed 21 files across 6 subdirectories:

- **Root files**:
  - `package.json` (lines 1–26)
  - `next.config.js` (lines 1–28)
  - `tsconfig.json` (lines 1–23)
  - `next-env.d.ts` (lines 1–6)
  - `tsconfig.tsbuildinfo`
- **Pages** (`pages/`):
  - `pages/index.tsx` (lines 1–41): Standalone index page rendering `ServerCard` via `getServerSideProps` calling `getServerData()`.
  - `pages/_app.tsx` (lines 1–7): Custom App component wrapping pages with `styles/globals.css`.
  - `pages/404.tsx` (lines 1–10): Custom 404 handler.
  - `pages/500.tsx` (lines 1–10): Custom 500 handler.
  - `pages/api/server-data.ts` (lines 1–44): REST endpoint returning `ServerPayload` with cache headers.
  - `pages/api/sse-events.ts` (lines 1–57): SSE streaming endpoint emitting telemetry every 1500ms.
- **Components** (`components/`):
  - `components/RemoteDashboard.tsx` (lines 1–68): Client component with tab switcher rendering `ServerCard`, `RemoteTelemetry`, and `RemoteMap`.
  - `components/ServerCard.tsx` (lines 1–102): Client card component displaying SSR metadata and counter action.
  - `components/RemoteMap.tsx` (lines 1–200): Client component embedding MapLibre GL raster map.
  - `components/RemoteTelemetry.tsx` (lines 1–134): Client component consuming SSE stream from `/api/sse-events`.
- **Utilities & Logic** (`lib/`):
  - `lib/cache.ts` (lines 1–34): In-memory TTL cache (`Map<string, CacheEntry<unknown>>`).
  - `lib/events.ts` (lines 1–66): DOM CustomEvent dispatchers (`mfe:toast`, `mfe:session-change`, `mfe:map-select`).
  - `lib/getServerData.ts` (lines 1–42): Diagnostic payload builder with CPU/RAM metrics and cache.
  - `lib/logger.ts` (lines 1–85): Isomorphic structured logger (`remoteLog`).
  - `lib/logger.test.mjs` (lines 1–36): Unit test for `logger.ts` using `node:test` and `node:assert/strict`.
- **Types & Styles**:
  - `types/index.ts` (lines 1–72): Interfaces `UserSession`, `ServerMetrics`, `ServerPayload`, `TelemetryEvent`, `MapMarker`, `ToastPayload`, `ServerCardProps`, `RemoteMapProps`, `RemoteTelemetryProps`.
  - `styles/globals.css`: Styling for components and layouts.
  - `public/favicon.ico`: Static asset.

### 1.2 `apps/remote/package.json` Verbatim Inspection
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

### 1.3 `apps/remote/next.config.js` Verbatim Inspection
```javascript
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'remote',
        filename: 'static/chunks/remoteEntry.js',
        exposes: {
          './ServerCard': './components/ServerCard.tsx',
          './RemoteMap': './components/RemoteMap.tsx',
          './RemoteTelemetry': './components/RemoteTelemetry.tsx',
          './RemoteDashboard': './components/RemoteDashboard.tsx',
          './getServerData': './lib/getServerData.ts',
          './events': './lib/events.ts',
        },
        shared: {},
      })
    );

    return config;
  },
};

module.exports = nextConfig;
```

### 1.4 `apps/remote/tsconfig.json` Verbatim Inspection
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
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

### 1.5 Root Workspace Configuration & References
- **`pnpm-workspace.yaml`**:
  ```yaml
  packages:
    - 'apps/*'

  allowBuilds:
    '@module-federation/nextjs-mf': true

  onlyBuiltDependencies:
    - '@module-federation/nextjs-mf'
    - '@module-federation/enhanced'
    - '@swc/core'
    - 'webpack'

  overrides:
    enhanced-resolve: '5.17.1'
    webpack: '5.90.3'
  ```
  The workspace package glob `apps/*` will automatically discover `apps/remote-app` upon folder rename without requiring pattern changes.
- **Root `package.json`**:
  Lines 6, 9, 12, 15:
  ```json
  "dev:remote": "pnpm --filter @mfe/remote dev",
  "build:remote": "pnpm --filter @mfe/remote build",
  "start:remote": "pnpm --filter @mfe/remote start",
  "typecheck": "pnpm --filter @mfe/remote typecheck && pnpm --filter @mfe/host typecheck",
  ```
  Notice: Package filters use `@mfe/remote`.

### 1.6 Compiler Diagnostic on `exactOptionalPropertyTypes`
Executing `tsc --noEmit --exactOptionalPropertyTypes true` in `apps/remote` produced verbatim 5 TS2375 compiler errors:
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

### 1.7 Current Testing Setup
- Neither `jest` nor `vitest` nor `tsx` is declared in `apps/remote/package.json` or root `package.json` or present in `pnpm-lock.yaml`.
- The only test currently in `apps/remote` is `lib/logger.test.mjs`, which uses Node.js native test runner:
  ```javascript
  import test from 'node:test';
  import assert from 'node:assert/strict';
  ```
  Historically executed via `node --test apps/remote/lib/logger.test.mjs`.

---

## 2. Logic Chain

### 2.1 R1 Logic Chain (Directory & Package Renaming)
1. **Observation 1.1 & 1.5**: Directory is currently named `apps/remote`. Root `pnpm-workspace.yaml` matches `apps/*`. `apps/remote/package.json` defines `"name": "@mfe/remote"`. Root `package.json` defines scripts filtering `--filter @mfe/remote`.
2. **Inference**:
   - Renaming `apps/remote` → `apps/remote-app` is safe with `git mv apps/remote apps/remote-app`.
   - `pnpm-workspace.yaml` requires no changes to discover `apps/remote-app`.
   - In `apps/remote-app/package.json`, if `"name"` is changed to `"remote-app"` (as stated in Task 1 of `2026-09-11-multizone-refactor.md`), root `package.json` scripts (`dev:remote`, `build:remote`, `start:remote`, `typecheck`) must be updated to `--filter remote-app` (or if scoped, `--filter @mfe/remote-app`). If root scripts are not aligned with the new name, `pnpm dev` and `pnpm typecheck` will error out with missing workspace filters.
   - Re-running `pnpm install` refreshes symlinks in `node_modules`.

### 2.2 R2 Logic Chain (Multi-Zones Zone Configuration)
1. **Observation 1.3**: `next.config.js` currently requires `NextFederationPlugin` from `@module-federation/nextjs-mf`, exposes 6 components, and customizes the Webpack pipeline.
2. **Inference**:
   - Multi-Zones eliminates Webpack federation. The plugin and Webpack hook must be stripped completely.
   - Multi-Zones contract requires:
     - `basePath: '/remote-app'`
     - `assetPrefix: '/remote-app-static'`
     - `reactStrictMode: true`
   - In `package.json`, `@module-federation/nextjs-mf` can be safely removed from `dependencies`.
   - In `package.json` scripts, `NEXT_PRIVATE_LOCAL_WEBPACK=true` was only needed by `@module-federation/nextjs-mf` to force local Webpack 5. In native Multi-Zones, this env flag can be removed, reverting to clean `next dev -p 3001` and `next build`.
3. **Observation 1.4 & 1.6**: Adding `"exactOptionalPropertyTypes": true` to `tsconfig.json` causes 5 TS2375 compiler errors in `components/RemoteDashboard.tsx`.
4. **Inference**:
   - With `exactOptionalPropertyTypes: true`, TypeScript distinguishes between a missing property and a property explicitly passed as `undefined`.
   - In `types/index.ts`, `ServerCardProps`, `RemoteMapProps`, and `RemoteTelemetryProps` have optional fields typed as `field?: T` instead of `field?: T | undefined`.
   - When `RemoteDashboard.tsx` passes `initialData={serverData || undefined}`, `session={session}` (where `session` is `UserSession | undefined`), etc., TS rejects the assignment.
   - To satisfy `exactOptionalPropertyTypes: true` cleanly without breaking existing components, `types/index.ts` must declare `readonly initialData?: ServerPayload | undefined;`, `readonly session?: UserSession | undefined;`, `readonly selectedCity?: string | undefined;`, `readonly lat?: number | undefined;`, `readonly lng?: number | undefined;`, `readonly filterLevel?: 'all' | 'info' | 'warn' | 'critical' | undefined;`, and `readonly maxEvents?: number | undefined;`.

### 2.3 R5 Logic Chain (Health Check and Fragment Stub)
1. **Observation 1.1**: The application is on Next.js 15 Pages Router (`pages/` directory).
2. **Inference for Health Check**:
   - Creating `apps/remote-app/pages/api/health.ts` mounts at `GET /remote-app/api/health` because `basePath: '/remote-app'` is active.
   - Handler:
     ```typescript
     import type { NextApiRequest, NextApiResponse } from 'next';
     export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
       res.status(200).json({ ok: true });
     }
     ```
   - Pure process liveness check: does not touch database, Redis, or upstream services.
3. **Inference for `_fragmento` Endpoint & Critical Pages Router Routing Invariant**:
   - In Next.js Pages Router, files/folders beginning with an underscore (`_`) in `pages/` (such as `pages/_fragmento/`) are treated by Next.js as internal/framework files and **are completely ignored by the file-system router** (they do not generate URL routes).
   - Furthermore, non-API files in `pages/` are compiled as React components for SSR rather than Node `(req, res)` HTTP handlers.
   - In unit testing (`test/fragmento.test.ts`), `import handler from '../pages/_fragmento/[name]/[id]'` calls `handler` directly with mock objects, which passes.
   - However, for the smoke test (`GET http://localhost:3000/remote-app/_fragmento/demo/42` proxied to `http://localhost:3001/remote-app/_fragmento/demo/42`), Next.js will return `404 Not Found` if `_fragmento` relies purely on Pages Router file mapping!
   - **Architectural Solution**:
     1. Place the handler at `apps/remote-app/pages/_fragmento/[name]/[id].tsx` (or `.ts`) to satisfy unit tests and architectural plan import paths.
     2. In `apps/remote-app/next.config.js`, add a rewrite rule so Next.js internal router dispatches `/_fragmento/:name/:id` to an API route handler, OR provide `pages/api/fragmento/[name]/[id].ts` that re-exports `pages/_fragmento/[name]/[id].tsx` and rewrite:
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
     3. Fragment Contract Enforcement:
        - Method check: If `req.method !== 'GET'`, return `res.status(405).end()`.
        - Whitelist check: `const KNOWN_FRAGMENTS = new Set(['demo'])`. If `!KNOWN_FRAGMENTS.has(name)`, return `res.status(204).end()`.
        - Parameter safety: `const safeId = encodeURIComponent(String(id))`.
        - Content-Type: `res.setHeader('Content-Type', 'text/html; charset=utf-8')`.
        - Inert HTML: `<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`. No `<script>`, no event handlers, no `'use client'`.
        - Security invariant: `204` represents both unknown fragment and unauthorized user — consumer cannot differentiate.

### 2.4 Test Runner Strategy Logic Chain
1. **Observation 1.7**: Monorepo has no Jest/Vitest. Plan suggests running `npx tsx --test test/*.test.ts`.
2. **Inference**:
   - `tsx --test` delegates to Node's native test runner (`node:test`) while transpiling TypeScript on the fly.
   - In Node's native test runner, assertions must be imported (e.g. `import assert from 'node:assert/strict'`), or if `expect` is used, an assertion utility must be in scope.
   - If tests are authored as in the plan (`expect(...).toBe(...)`), either:
     - Use `node:assert/strict` (e.g. `assert.equal(nextConfig.basePath, '/remote-app')`, `assert.match(res._headers['Content-Type'], /text\/html/)`), matching existing repo convention in `lib/logger.test.mjs`.
     - Or add a lightweight assertion helper / vitest / expect.
     - Document this clearly for the implementation agent.

---

## 3. Caveats

1. **Underscore Folder in Pages Router**: As highlighted in Logic Chain 2.3, `pages/_fragmento` will be ignored by the Pages Router unless routed via `rewrites()` in `next.config.js`. Unit tests calling `handler(mockReq, mockRes)` will pass, but HTTP curl/smoke tests will 404 without the rewrite.
2. **`exactOptionalPropertyTypes` Ripple Effect**: Enabling this setting in `tsconfig.json` without updating `types/index.ts` will break `npx tsc --noEmit` in `RemoteDashboard.tsx`. `types/index.ts` must be updated to include `| undefined` on optional props.
3. **Internal URLs in `RemoteTelemetry.tsx`**: In `components/RemoteTelemetry.tsx` lines 28–30, the component checks `window.location.port === '3001' ? '/api/sse-events' : 'http://localhost:3001/api/sse-events'`. Under `basePath: '/remote-app'`, the local route is actually `/remote-app/api/sse-events`. While this does not affect R1, R2, or R5 directly, it is worth noting for runtime stability.
4. **Offline / Restricted Environments for `npx tsx`**: If the execution environment has restricted internet access, `npx tsx` might fail if `tsx` is not already installed locally. Adding `"tsx": "^4.19.0"` to `devDependencies` or using Node 22+ native TypeScript support / `node --test` avoids network dependencies.

---

## 4. Conclusion

All prerequisites, file locations, exact code changes, and potential hazards for requirements **R1**, **R2**, and **R5** have been pinpointed.

### Summary of Required Changes:

| Req | Target File | Nature of Change | Key Details |
|---|---|---|---|
| **R1** | `apps/remote` → `apps/remote-app` | Directory rename | `git mv apps/remote apps/remote-app` |
| **R1** | `apps/remote-app/package.json` | Package name update | Change `"name": "@mfe/remote"` → `"name": "remote-app"` (or `"@mfe/remote-app"`) |
| **R1** | Root `package.json` | Script filter updates | Update `pnpm --filter @mfe/remote` to match the new package name |
| **R1** | `pnpm-workspace.yaml` | Stripping federation overrides | Keep `packages: ['apps/*']`, delete `allowBuilds`, `onlyBuiltDependencies`, `overrides` |
| **R2** | `apps/remote-app/next.config.js` | Multi-Zones config | Add `basePath: '/remote-app'`, `assetPrefix: '/remote-app-static'`, remove `NextFederationPlugin` and `webpack` hook |
| **R2** | `apps/remote-app/package.json` | Clean dependencies & scripts | Remove `@module-federation/nextjs-mf`, remove `NEXT_PRIVATE_LOCAL_WEBPACK=true` |
| **R2** | `apps/remote-app/tsconfig.json` | Compiler option | Add `"exactOptionalPropertyTypes": true` to `compilerOptions` |
| **R2** | `apps/remote-app/types/index.ts` | Type alignment for `exactOptionalPropertyTypes` | Add `\| undefined` to optional fields in `ServerCardProps`, `RemoteMapProps`, `RemoteTelemetryProps` to resolve TS2375 |
| **R2** | `apps/remote-app/test/next-config.test.ts` | Acceptance test | Test that `basePath === '/remote-app'` and `assetPrefix === '/remote-app-static'` |
| **R5** | `apps/remote-app/pages/api/health.ts` | Health check route | Returns `{ ok: true }` with status 200, zero domain I/O |
| **R5** | `apps/remote-app/pages/_fragmento/[name]/[id].tsx` | Fragment endpoint | GET-only, whitelist `demo`, 204 for unknown/unauth, 405 for non-GET, inert HTML no `<script>` |
| **R5** | `apps/remote-app/next.config.js` | Rewrite for `_fragmento` | Add rewrite mapping `/_fragmento/:name/:id` to API handler to bypass Pages Router underscore exclusion |
| **R5** | `apps/remote-app/test/health.test.ts` | Acceptance test | Verifies 200 `{ ok: true }` |
| **R5** | `apps/remote-app/test/fragmento.test.ts` | Acceptance test | Verifies 200 text/html without `<script>`, 204 on unknown, 405 on POST |

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Directory Structure & Clean Initial State**:
   ```bash
   fd . apps/remote --max-depth 2
   ```
2. **Verify TypeScript Compilation with `exactOptionalPropertyTypes`**:
   Run in `apps/remote`:
   ```bash
   npx tsc --noEmit --exactOptionalPropertyTypes true
   ```
   Confirm it emits the 5 TS2375 errors in `components/RemoteDashboard.tsx`.
3. **Verify Workspace Package Name and Filter References**:
   Inspect root `package.json` lines 6, 9, 12, 15 and `apps/remote/package.json` line 2:
   ```bash
   rg "@mfe/remote" package.json apps/remote/package.json
   ```
4. **Verify Federation Plugin Presence**:
   Inspect `apps/remote/next.config.js` lines 1–25:
   ```bash
   rg "NextFederationPlugin|remoteEntry" apps/remote/
   ```
5. **Verify Pages Router Underscore Routing Rule**:
   Refer to Next.js documentation on Pages Router ignored files: folders prefixed with `_` are excluded from routing, confirming the necessity of a rewrite rule in `next.config.js`.
