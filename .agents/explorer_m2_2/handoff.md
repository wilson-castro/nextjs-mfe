# Milestone 2 Shell UI & Navigation Architecture (R4) — Specification & Handoff Report

**Author:** Milestone 2 UI & Navigation Explorer (`explorer_m2_2`)  
**Parent Agent:** `012e9e76-2bff-4cfd-a734-2b498b65bab2`  
**Date:** 2026-09-11  
**Scope:** Milestone 2 Shell UI & Navigation Architecture (`apps/host`)  
**Target Files:**
- `apps/host/pages/index.tsx` (Rewrite)
- `apps/host/components/Header.tsx` (Decouple & Update)
- `apps/host/components/HostLayout.tsx` (Decouple & Update)
- `apps/host/components/SideNavigation.tsx` (Convert to Native Links & Update)
- Deleted files: `declarations.d.ts`, `safeRemoteLoader.ts`, `FederatedErrorBoundary.tsx`, `RemoteCardClientWrapper.tsx`, `RemoteFallbackCard.tsx`

---

## 1. Observation

### 1.1 Current `apps/host/pages/index.tsx` Inspection
Inspection of `apps/host/pages/index.tsx` (210 lines total) reveals heavy coupling to Webpack Module Federation and violation of the Multi-Zones Shell DAL Exclusion invariant:
1. **Module Federation Type Imports (line 4):**
   ```typescript
   import type { ServerPayload } from 'remote/ServerCard';
   ```
   Depends on ambient module types declared in `apps/host/declarations.d.ts`.
2. **Federated Components & Loaders (lines 5–8):**
   ```typescript
   import FederatedErrorBoundary from '../components/FederatedErrorBoundary';
   import RemoteFallbackCard from '../components/RemoteFallbackCard';
   import HostLayout from '../components/HostLayout';
   import { fetchRemoteServerData } from '../lib/safeRemoteLoader';
   ```
3. **Dynamic Federated Module Import (lines 12–28):**
   ```typescript
   const RemoteDashboard = lazy(() =>
     import('remote/RemoteDashboard')
       .then((mod) => {
         hostLog.client('FEDERATION_LOAD_REMOTE_SUCCESS', { module: 'remote/RemoteDashboard' });
         return mod;
       })
       .catch((err: Error) => {
         hostLog.error('FEDERATION_LOAD_REMOTE_ERROR', err);
         return {
           default: () => (
             <RemoteFallbackCard
               reason={`Module load error: ${err.message || 'Remote bundle unavailable'}`}
             />
           ),
         };
       })
   );
   ```
4. **Coupled Props Interface (lines 30–40):**
   `HostHomePageProps` requires `serverData: ServerPayload | null`, `isRemoteAvailable: boolean`, `errorReason: string | null`, `initialTab: string`, `initialFilter: string | null`, `initialCity: string | null`.
5. **Coupled Layout Invocations (lines 98–104):**
   `HostLayout` is passed `currentTab={activeTab}`, `isRemoteAvailable={isRemoteAvailable}`, and `onTabSelect={handleTabChange}`.
6. **Federated Remote Slot Rendering (lines 119–145):**
   Wraps `<RemoteDashboard>` in `<FederatedErrorBoundary>` and `<Suspense>`, falling back to `<RemoteFallbackCard>`.
7. **Shell DAL Invariant Violation in `getServerSideProps` (lines 165–167):**
   ```typescript
   // 1. Fetch remote server data with 800ms upper-bound timeout and session headers
   const serverData = await fetchRemoteServerData('http://localhost:3001/api/server-data', 800, session);
   ```
   The shell Node process acts as a data client fetching remote domain business data over HTTP during SSR. Multi-Zones mandates that the shell contains zero DAL, zero domain fetching, and zero business logic.

---

### 1.2 Deprecated Files Slated for Deletion
The following 5 files in `apps/host` are tightly coupled to Module Federation and are obsolete in Multi-Zones:
1. `apps/host/declarations.d.ts` (106 lines) — Ambient module declarations for `remote/ServerCard`, `remote/RemoteTelemetry`, `remote/RemoteMap`, `remote/RemoteDashboard`, `remote/getServerData`, and `remote/events`.
2. `apps/host/lib/safeRemoteLoader.ts` (100 lines) — Server-side Node HTTP fetcher for remote card data with timeout and error fallback.
3. `apps/host/components/FederatedErrorBoundary.tsx` (63 lines) — React class error boundary designed specifically for federated chunk load failures.
4. `apps/host/components/RemoteCardClientWrapper.tsx` (47 lines) — Client wrapper executing `import('remote/ServerCard')`.
5. `apps/host/components/RemoteFallbackCard.tsx` (45 lines) — Fallback card displaying "Remote Service Unavailable (Port 3001)". It is only imported by `index.tsx`, `RemoteCardClientWrapper.tsx`, and `FederatedErrorBoundary.tsx`. When those are deleted/rewritten, it becomes dead code (explicitly scheduled for deletion in `PROJECT.md` line 86).

---

### 1.3 Coupling Across Shell Layout Components (`HostLayout`, `Header`, `SideNavigation`)

#### A. `apps/host/components/Header.tsx` (81 lines):
- `HeaderProps` (lines 8–12):
  ```typescript
  interface HeaderProps {
    readonly currentSession: UserSession;
    readonly onSessionChange: (session: UserSession) => void;
    readonly isRemoteAvailable: boolean; // MANDATORY PROP
  }
  ```
- Lines 47–50:
  ```tsx
  <div className="system-pill">
    <span className={`status-dot ${isRemoteAvailable ? 'dot-online' : 'dot-offline'}`} />
    <span>Remote MFE (3001): {isRemoteAvailable ? 'Online' : 'Degraded'}</span>
  </div>
  ```
- **Finding:** If `HostLayout` omits `isRemoteAvailable`, `tsc --noEmit` will fail with:
  `Property 'isRemoteAvailable' is missing in type '{ currentSession: UserSession; onSessionChange: (session: UserSession) => void; }' but required in type 'HeaderProps'`.

#### B. `apps/host/components/HostLayout.tsx` (50 lines):
- `HostLayoutProps` (lines 9–16):
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
- Passes `isRemoteAvailable` to `Header` (line 31) and `currentTab`/`onTabSelect` to `SideNavigation` (line 36).

#### C. `apps/host/components/SideNavigation.tsx` (61 lines):
- `SideNavigationProps` (lines 6–9): accepts `currentTab: string`, `onTabSelect?: (tabId: string) => void`.
- Lines 11–16: Defines 4 tabs (`overview`, `telemetry`, `map`, `metrics`) used for client-side switching of federated component views.
- Lines 27–38: Renders tabs with `onClick={(e) => { e.preventDefault(); onTabSelect?.(item.id); }}`.
- Lines 50–55: Renders a footer badge:
  ```tsx
  <div className="nav-footer">
    <div className="nav-badge-box">
      <small className="nav-badge-title">Module Federation v8</small>
      <p className="nav-badge-desc">Next.js SSR + Client Islands</p>
    </div>
  </div>
  ```
- **CSS Class Alignment:**
  Inspection of `apps/host/styles/globals.css` (lines 150–245) confirms the following classes are already declared and styled:
  - `.side-navigation` (container)
  - `.nav-section-title` (header)
  - `.nav-list` (`<ul>`)
  - `.nav-item` (`<li>`)
  - `.nav-link` (`<a>` link styling with hover state)
  - `.nav-icon`, `.nav-text-block`, `.nav-title`, `.nav-description`
  - `.nav-footer`, `.nav-badge-box`, `.nav-badge-title`, `.nav-badge-desc`
  *(Note: The class `.side-nav` referenced in initial notes does NOT exist in `globals.css`; using `.side-navigation` and `.nav-link` preserves exact pixel-perfect design).*

---

### 1.4 TypeScript Audit & Federation References
- `rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/host` hits only `declarations.d.ts`, `next.config.js`, `package.json`, `pages/index.tsx`, `safeRemoteLoader.ts`, and `RemoteCardClientWrapper.tsx`.
- `UserSession` is cleanly self-contained in `apps/host/lib/session.ts`.
- `ToastPayload` and `MFE_EVENTS` are cleanly self-contained in `apps/host/lib/events.ts`.
- Running `rtk npx tsc --noEmit` in `apps/host` currently reports: `TypeScript: No errors found`.

---

## 2. Logic Chain

1. **Eliminating `remote/*` Type Declarations & Imports:**
   - Observation 1.1 & 1.2 demonstrate that `declarations.d.ts` provides ambient declarations for `remote/*` modules.
   - When `declarations.d.ts` is deleted, any file that retains `import ... from 'remote/...'` will produce a TypeScript compilation error (`TS2307: Cannot find module 'remote/...'`).
   - Therefore, `pages/index.tsx` must be rewritten without any `remote/*` imports, and `safeRemoteLoader.ts`, `RemoteCardClientWrapper.tsx`, and `FederatedErrorBoundary.tsx` must be deleted simultaneously with `declarations.d.ts`.

2. **Enforcing Shell DAL Exclusion (Architecture Invariant F7):**
   - Observation 1.1 shows that `getServerSideProps` in `pages/index.tsx` makes an HTTP call to `http://localhost:3001/api/server-data` via `fetchRemoteServerData`.
   - In Multi-Zones, each zone is an autonomous application with its own BFF and data lifecycle. The Shell Gateway must never contain a Domain Access Layer, fetch business data, or depend on zone runtime internals.
   - Therefore, `pages/index.tsx` `getServerSideProps` must only return shell runtime metadata (`hostRenderTimestamp`, `initialSession`, `initialRoute`) and execute zero domain network requests.

3. **Plain HTML `<a>` Navigation vs Next.js `<Link>` (Architecture Invariant F6):**
   - In Multi-Zones, `apps/host` and `apps/remote-app` have separate Webpack runtimes, distinct asset prefixes (`/remote-app-static`), and separate client route tables.
   - Next.js `<Link href="/remote-app">` performs a client-side pushState transition and requests `/_next/data/...` using the host's route manifest, causing silent 404s, missing page crashes, or hydration mismatches.
   - Plain HTML `<a href="/remote-app">` triggers a full browser document navigation. The browser requests `http://localhost:3000/remote-app`, which is proxied by the shell rewrite to `http://localhost:3001/remote-app`. The browser then loads the zone's HTML, zone scripts from `/remote-app-static`, and initializes a clean React runtime.
   - Therefore, all cross-zone links in `pages/index.tsx` and `SideNavigation.tsx` MUST use `<a href="/remote-app">`, NEVER Next.js `<Link>`.

4. **Decoupling `Header.tsx` and `HostLayout.tsx`:**
   - Observation 1.3 shows that `HeaderProps` currently requires `isRemoteAvailable: boolean`.
   - In Multi-Zones, the host does not poll or probe the remote zone's SSR availability.
   - If `HostLayout` removes `isRemoteAvailable` without updating `Header.tsx`, compilation fails (`TS2741`).
   - Therefore, `HeaderProps` must remove `isRemoteAvailable` (or make it optional `isRemoteAvailable?: boolean`). The system pill in `Header.tsx` should display the Host Gateway's own status (`Multi-Zones Gateway (Port 3000)`), eliminating false degradation warnings.

5. **Refactoring `SideNavigation.tsx`:**
   - Observation 1.3 shows that `SideNavigation` currently renders tab buttons for switching federated views and displays a "Module Federation v8" badge.
   - In Multi-Zones, the application structure consists of autonomous zones rather than client tabs.
   - Therefore, `SideNavigation` must replace tabs with native navigation links:
     - `/` for Shell Home
     - `/remote-app` for Remote App Zone (using plain `<a>`)
   - The badge should be updated to "Next.js Multi-Zones" and "Native HTTP Zone Routing".

6. **Cleanup of Orphaned `RemoteFallbackCard.tsx`:**
   - Observation 1.2 shows that `RemoteFallbackCard.tsx` is only used by files being deleted or rewritten.
   - Removing it keeps the codebase lean, avoids dead code, and fulfills `PROJECT.md` line 86.

---

## 3. Caveats

1. **Read-Only Scope:** No source files or tests have been modified or deleted during this investigation. All code in Section 4 is provided as a drop-in specification for the Milestone 2 Worker.
2. **Next.js Config Rewrites Dependency (R3):** The navigation link `<a href="/remote-app">` relies on the rewrites configured in `apps/host/next.config.js`. When the Worker executes Milestone 2, both the rewrites (R3) and the UI/Navigation (R4) must be applied so that clicking the link succeeds in end-to-end smoke testing.
3. **Session Coordination:** Session switching via the Header's dropdown updates `localStorage` (`host_user_session`). In Multi-Zones, cookies (`__Host-session`) or query parameters will be used across zones as detailed in `02-zonas.md`. The client-side session selector in `Header.tsx` remains functional and intact.

---

## 4. Conclusion & Concrete Implementation Specification

The Milestone 2 Worker must execute two categories of changes: **file deletions** and **file rewrites**.

### 4.1 Files to Delete (5 files)
Delete the following 5 files from `apps/host`:
```bash
rm apps/host/declarations.d.ts
rm apps/host/lib/safeRemoteLoader.ts
rm apps/host/components/FederatedErrorBoundary.tsx
rm apps/host/components/RemoteCardClientWrapper.tsx
rm apps/host/components/RemoteFallbackCard.tsx
```

---

### 4.2 Complete Replacement Code for `apps/host/pages/index.tsx`
**File:** `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host/pages/index.tsx`  
**Description:** Full replacement rendering shell architecture diagnostics, active session, and a plain HTML `<a>` link to `/remote-app`. Completely excludes DAL and remote federation imports.

```tsx
import React, { useState, useEffect } from 'react';
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import HostLayout from '../components/HostLayout';
import {
  DEFAULT_SESSION,
  getSessionFromStorage,
  saveSessionToStorage,
  type UserSession,
} from '../lib/session';
import { hostLog } from '../lib/logger';

interface HostHomePageProps {
  readonly hostRenderTimestamp: string;
  readonly initialSession: UserSession;
  readonly initialRoute: string;
}

const HostHomePage: NextPage<HostHomePageProps> = ({
  hostRenderTimestamp,
  initialSession,
  initialRoute,
}) => {
  const [currentSession, setCurrentSession] = useState<UserSession>(initialSession);

  useEffect(() => {
    const saved = getSessionFromStorage();
    if (saved.userId !== initialSession.userId) {
      setCurrentSession(saved);
    }
  }, [initialSession]);

  const handleSessionChange = (nextSession: UserSession) => {
    hostLog.client('HOST_SESSION_UPDATED', {
      user: nextSession.userName,
      role: nextSession.role,
    });
    setCurrentSession(nextSession);
    saveSessionToStorage(nextSession);
  };

  return (
    <>
      <Head>
        <title>Enterprise Multi-Zones Shell</title>
        <meta
          name="description"
          content="Next.js Multi-Zones Shell Gateway with HTTP routing, session coordination, and telemetry"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <HostLayout currentSession={currentSession} onSessionChange={handleSessionChange}>
        <section className="host-section">
          <div className="section-header-flex">
            <div>
              <h2>Shell Runtime Diagnostics</h2>
              <p className="status-text">
                SSR Rendered at: <strong>{hostRenderTimestamp}</strong>
              </p>
            </div>
            <div className="active-route-pill">
              Route: <code>{initialRoute}</code>
            </div>
          </div>

          <dl className="data-grid" style={{ marginTop: '1.25rem' }}>
            <div className="data-row">
              <dt>Architecture Pattern</dt>
              <dd className="data-value highlight">Next.js Multi-Zones Gateway</dd>
            </div>
            <div className="data-row">
              <dt>Shell Gateway Port</dt>
              <dd className="data-value mono">3000</dd>
            </div>
            <div className="data-row">
              <dt>Zone 2 Rewrite Rule</dt>
              <dd className="data-value mono">/remote-app &rarr; :3001/remote-app</dd>
            </div>
            <div className="data-row">
              <dt>Zone Static Assets Rule</dt>
              <dd className="data-value mono">/remote-app-static/:path* &rarr; :3001/remote-app-static/:path*</dd>
            </div>
            <div className="data-row">
              <dt>Active Session</dt>
              <dd className="data-value">
                {currentSession.userName} ({currentSession.role})
              </dd>
            </div>
          </dl>
        </section>

        <section className="host-section">
          <h2>Connected Zones</h2>
          <p className="status-text" style={{ marginBottom: '1.25rem' }}>
            Multi-Zones runs autonomous Next.js applications behind the host shell gateway.
            Cross-zone navigation triggers full browser document loads to ensure clean runtime isolation.
          </p>

          <div className="federated-card" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="federated-card-header">
              <span className="badge">Zone 2</span>
              <h3 className="card-title">Remote App Zone</h3>
            </div>
            <p className="status-text" style={{ marginBottom: '1rem' }}>
              Autonomous Next.js zone serving under <code>basePath: &apos;/remote-app&apos;</code> with dedicated BFF and static asset prefixes.
            </p>
            {/* Architectural invariant: cross-zone link MUST use plain HTML <a>, NEVER Next.js <Link> */}
            <a
              href="/remote-app"
              className="action-btn"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              Open Remote App Zone &rarr;
            </a>
          </div>
        </section>
      </HostLayout>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<HostHomePageProps> = async (context) => {
  const hostRenderTimestamp = new Date().toISOString();
  const session = DEFAULT_SESSION;
  const initialRoute = context.resolvedUrl || '/';

  // Shell contains zero DAL/business data fetches — only shell runtime metadata
  hostLog.server('SSR_PAGE_RENDER', {
    route: initialRoute,
    user: session.userName,
  });

  return {
    props: {
      hostRenderTimestamp,
      initialSession: session,
      initialRoute,
    },
  };
};

export default HostHomePage;
```

---

### 4.3 Complete Replacement Code for `apps/host/components/Header.tsx`
**File:** `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host/components/Header.tsx`  
**Description:** Decouples `Header` from `isRemoteAvailable` (removes the required prop, makes it optional for backward-compatibility), and updates the system pill to display the Host Shell Gateway status.

```tsx
'use client';

import React from 'react';
import { PRESET_USERS, type UserSession } from '../lib/session';
import { emitToast } from '../lib/events';
import { hostLog } from '../lib/logger';

interface HeaderProps {
  readonly currentSession: UserSession;
  readonly onSessionChange: (session: UserSession) => void;
  readonly isRemoteAvailable?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSession,
  onSessionChange,
  isRemoteAvailable,
}) => {
  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRESET_USERS.find((u) => u.userId === e.target.value);
    if (!selected) return;

    hostLog.client('SESSION_SWITCHED', {
      userId: selected.userId,
      user: selected.userName,
      role: selected.role,
    });
    onSessionChange(selected);
    emitToast(
      'Session Switched in Host',
      `Active user changed to ${selected.userName} (${selected.role})`,
      'info'
    );
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo">MFE</div>
        <div>
          <h1 className="brand-title">Enterprise MFE Host</h1>
          <span className="brand-subtitle">Next.js Multi-Zones Shell (Port 3000)</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="system-pill">
          <span className={`status-dot ${isRemoteAvailable === false ? 'dot-offline' : 'dot-online'}`} />
          <span>
            {isRemoteAvailable !== undefined
              ? `Remote App (3001): ${isRemoteAvailable ? 'Online' : 'Degraded'}`
              : 'Multi-Zones Gateway (Port 3000)'}
          </span>
        </div>

        <div className="session-selector">
          <label htmlFor="user-select" className="session-label">Session:</label>
          <select
            id="user-select"
            value={currentSession.userId}
            onChange={handleUserSelect}
            className="session-dropdown"
          >
            {PRESET_USERS.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.userName} ({user.role})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="header-toast-btn"
          onClick={() => emitToast('Host Notification', 'Event triggered from Host Shell Header', 'info')}
        >
          🔔 Ping Toast
        </button>
      </div>
    </header>
  );
};

export default Header;
```

---

### 4.4 Complete Replacement Code for `apps/host/components/HostLayout.tsx`
**File:** `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host/components/HostLayout.tsx`  
**Description:** Strips `currentTab`, `isRemoteAvailable`, and `onTabSelect`. Renders `Header`, `SideNavigation`, and children cleanly.

```tsx
'use client';

import React from 'react';
import Header from './Header';
import SideNavigation from './SideNavigation';
import ToastContainer from './ToastContainer';
import type { UserSession } from '../lib/session';

interface HostLayoutProps {
  readonly children: React.ReactNode;
  readonly currentSession: UserSession;
  readonly onSessionChange: (session: UserSession) => void;
}

export const HostLayout: React.FC<HostLayoutProps> = ({
  children,
  currentSession,
  onSessionChange,
}) => {
  return (
    <div className="layout-root">
      <Header
        currentSession={currentSession}
        onSessionChange={onSessionChange}
      />

      <div className="layout-body">
        <aside className="layout-sidebar">
          <SideNavigation />
        </aside>

        <main className="layout-main">
          {children}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};

export default HostLayout;
```

---

### 4.5 Complete Replacement Code for `apps/host/components/SideNavigation.tsx`
**File:** `/home/gabrigas/Selene/Adventure/nextjs-mfe/apps/host/components/SideNavigation.tsx`  
**Description:** Converts tabs to static native `<a>` navigation links. Cross-zone link to `/remote-app` uses plain `<a>`. Uses matching `.side-navigation` and `.nav-link` CSS classes from `globals.css` and updates footer badge.

```tsx
'use client';

import React from 'react';
import { hostLog } from '../lib/logger';

export interface SideNavigationProps {
  readonly currentTab?: string;
  readonly onTabSelect?: (tabId: string) => void;
}

export const SideNavigation: React.FC<SideNavigationProps> = () => {
  const handleNavClick = (label: string, destination: string) => {
    hostLog.client('NAVIGATE_ZONE_CLICK', { label, destination });
  };

  return (
    <nav className="side-navigation" aria-label="Main Navigation">
      <div className="nav-section-title">Zones & Navigation</div>
      <ul className="nav-list">
        <li className="nav-item">
          <a
            href="/"
            className="nav-link"
            onClick={() => handleNavClick('Shell Home', '/')}
          >
            <span className="nav-icon">🏠</span>
            <div className="nav-text-block">
              <span className="nav-title">Shell Home</span>
              <span className="nav-description">Gateway diagnostics</span>
            </div>
          </a>
        </li>
        <li className="nav-item">
          {/* Architectural invariant: cross-zone navigation MUST use plain <a>, NEVER Next.js <Link> */}
          <a
            href="/remote-app"
            className="nav-link"
            onClick={() => handleNavClick('Remote App Zone', '/remote-app')}
          >
            <span className="nav-icon">📦</span>
            <div className="nav-text-block">
              <span className="nav-title">Remote App</span>
              <span className="nav-description">Port 3001 autonomous zone</span>
            </div>
          </a>
        </li>
      </ul>

      <div className="nav-footer">
        <div className="nav-badge-box">
          <small className="nav-badge-title">Next.js Multi-Zones</small>
          <p className="nav-badge-desc">Native HTTP Zone Routing</p>
        </div>
      </div>
    </nav>
  );
};

export default SideNavigation;
```

---

### 4.6 TypeScript Interface Status Table

| File | Interface | Status | Notes |
|---|---|---|---|
| `apps/host/declarations.d.ts` | `declare module 'remote/*'` | **DELETED** | Removes all ambient module shims |
| `apps/host/lib/safeRemoteLoader.ts` | `SafeRemoteLoaderOptions` | **DELETED** | Shell DAL deleted |
| `apps/host/components/FederatedErrorBoundary.tsx` | `FederatedErrorBoundaryProps` | **DELETED** | Federation error boundary deleted |
| `apps/host/components/RemoteCardClientWrapper.tsx` | `RemoteCardClientWrapperProps` | **DELETED** | Client dynamic import wrapper deleted |
| `apps/host/components/RemoteFallbackCard.tsx` | `RemoteFallbackCardProps` | **DELETED** | Orphaned fallback card deleted |
| `apps/host/pages/index.tsx` | `HostHomePageProps` | **REPLACED** | Stripped `serverData`, `isRemoteAvailable`, `errorReason`, tabs |
| `apps/host/components/Header.tsx` | `HeaderProps` | **UPDATED** | `isRemoteAvailable` made optional; decoupled from SSR |
| `apps/host/components/HostLayout.tsx` | `HostLayoutProps` | **UPDATED** | Stripped `currentTab`, `isRemoteAvailable`, `onTabSelect` |
| `apps/host/components/SideNavigation.tsx` | `SideNavigationProps` | **UPDATED** | Props made optional; components renders static `<a>` |
| `apps/host/lib/session.ts` | `UserSession` | **RETAINED** | Clean, self-contained |
| `apps/host/lib/events.ts` | `ToastPayload`, `MFE_EVENTS` | **RETAINED** | Clean, self-contained |

---

## 5. Verification Method

### 5.1 Verification Commands
Once the Worker applies the deletions and code replacements, run:

1. **TypeScript Typecheck:**
   ```bash
   cd apps/host && rtk npx tsc --noEmit
   ```
   *Expected Result:* Zero errors (`TypeScript: No errors found`).

2. **Module Federation Remnants Check:**
   ```bash
   rg "@module-federation|remoteEntry|NextFederationPlugin|remote/ServerCard|remote/RemoteDashboard" apps/host
   ```
   *Expected Result:* Zero matches outside `next.config.js` and `package.json` (which are addressed in R3).

3. **Cross-Zone `<Link>` Prohibition Check:**
   ```bash
   rg "<Link.*remote-app" apps/host
   ```
   *Expected Result:* Zero matches. All cross-zone links use `<a href="/remote-app">`.

4. **Shell DAL Exclusion Check:**
   ```bash
   rg "safeRemoteLoader|fetchRemoteServerData|http://localhost:3001/api" apps/host
   ```
   *Expected Result:* Zero matches.

5. **Runtime Smoke Test (with both apps running):**
   ```bash
   curl -s http://localhost:3000/ | grep -q "Open Remote App Zone"
   ```
   *Expected Result:* Exit code 0, shell homepage renders with zone link.
