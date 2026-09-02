# MFE Client and Server Communication Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured, styled communication logs across Host and Remote MFEs in terminal stdout (ANSI) and browser console (CSS badges) to trace all client-side and server-side interactions in real time.

**Architecture:** Introduce lightweight isomorphic loggers (`apps/host/lib/logger.ts` and `apps/remote/lib/logger.ts`) that detect environment (Node server vs browser window). Server logs use ANSI color escapes matching the monorepo runner and write directly to stdout/console. Client logs format with `%c` colored badges in DevTools. Instrument all SSR fetches, SSE streams, CustomEvents, and federated hydration points.

**Tech Stack:** Next.js 15, React 19, TypeScript, Webpack 5 Module Federation, Node.js `node:test`.

## Global Constraints
- Use `pnpm` exclusively for all package manager commands.
- Functions ~4–20 lines (hard ceiling 50 lines), files under 500 lines.
- Immutable patterns, no mutations in place.
- No `any` type annotations.
- ANSI colors for terminal: Magenta for Host (`\x1b[35m`), Cyan for Remote (`\x1b[36m`).
- Browser CSS badges: Purple for Host (`#6b21a8`), Cyan for Remote (`#0891b2`).

---

### Task 1: Create Isomorphic Logger for Host MFE

**Files:**
- Create: `apps/host/lib/logger.ts`
- Test: `apps/host/lib/logger.test.mjs`

**Interfaces:**
- Produces: `export const hostLog: { server: (action: string, metadata?: Record<string, unknown>) => void; client: (action: string, metadata?: Record<string, unknown>) => void; error: (action: string, error: unknown) => void; }`

- [ ] **Step 1: Write the failing test**

```javascript
// apps/host/lib/logger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostLog } from './logger.js';

test('hostLog formats server stdout message correctly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    hostLog.server('TEST_ACTION', { status: 200 });
    assert.match(captured, /\[HOST:SERVER\]/);
    assert.match(captured, /TEST_ACTION/);
    assert.match(captured, /200/);
  } finally {
    process.stdout.write = originalWrite;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/host/lib/logger.test.mjs`
Expected: FAIL (cannot find module `./logger.js`)

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/host/lib/logger.ts
const ANSI_RESET = '\x1b[0m';
const ANSI_MAGENTA = '\x1b[35m';
const ANSI_GRAY = '\x1b[90m';
const ANSI_RED = '\x1b[31m';

function formatTerminal(tag: string, action: string, metadata?: Record<string, unknown>): string {
  const time = new Date().toISOString().substring(11, 23);
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
  return `${ANSI_MAGENTA}[${tag}]${ANSI_RESET} ${ANSI_GRAY}${time}${ANSI_RESET} - ${action}${metaStr}\n`;
}

export const hostLog = {
  server(action: string, metadata?: Record<string, unknown>): void {
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(formatTerminal('HOST:SERVER', action, metadata));
    } else {
      console.log(`[HOST:SERVER] ${action}`, metadata ?? '');
    }
  },
  client(action: string, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') {
      this.server(action, metadata);
      return;
    }
    const badgeStyle = 'background: #6b21a8; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;';
    if (metadata !== undefined) {
      console.log(`%cHOST:CLIENT%c ${action}`, badgeStyle, '', metadata);
    } else {
      console.log(`%cHOST:CLIENT%c ${action}`, badgeStyle, '');
    }
  },
  error(action: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(`${ANSI_RED}[HOST:ERROR]${ANSI_RESET} ${action}: ${errorMsg}\n`);
    } else {
      console.error(`%cHOST:ERROR%c ${action}`, 'background: #dc2626; color: #fff; padding: 2px 6px;', '', error);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/host/lib/logger.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/host/lib/logger.ts apps/host/lib/logger.test.mjs
git commit -m "feat(host): add isomorphic tagged logger with stdout and console formatting"
```

---

### Task 2: Create Isomorphic Logger for Remote MFE

**Files:**
- Create: `apps/remote/lib/logger.ts`
- Test: `apps/remote/lib/logger.test.mjs`

**Interfaces:**
- Produces: `export const remoteLog: { server: (action: string, metadata?: Record<string, unknown>) => void; client: (action: string, metadata?: Record<string, unknown>) => void; error: (action: string, error: unknown) => void; }`

- [ ] **Step 1: Write the failing test**

```javascript
// apps/remote/lib/logger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteLog } from './logger.js';

test('remoteLog formats server stdout message correctly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    remoteLog.server('REMOTE_TEST', { cached: true });
    assert.match(captured, /\[REMOTE:SERVER\]/);
    assert.match(captured, /REMOTE_TEST/);
    assert.match(captured, /cached/);
  } finally {
    process.stdout.write = originalWrite;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/remote/lib/logger.test.mjs`
Expected: FAIL (cannot find module `./logger.js`)

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/remote/lib/logger.ts
const ANSI_RESET = '\x1b[0m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GRAY = '\x1b[90m';
const ANSI_RED = '\x1b[31m';

function formatTerminal(tag: string, action: string, metadata?: Record<string, unknown>): string {
  const time = new Date().toISOString().substring(11, 23);
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
  return `${ANSI_CYAN}[${tag}]${ANSI_RESET} ${ANSI_GRAY}${time}${ANSI_RESET} - ${action}${metaStr}\n`;
}

export const remoteLog = {
  server(action: string, metadata?: Record<string, unknown>): void {
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(formatTerminal('REMOTE:SERVER', action, metadata));
    } else {
      console.log(`[REMOTE:SERVER] ${action}`, metadata ?? '');
    }
  },
  client(action: string, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') {
      this.server(action, metadata);
      return;
    }
    const badgeStyle = 'background: #0891b2; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;';
    if (metadata !== undefined) {
      console.log(`%cREMOTE:CLIENT%c ${action}`, badgeStyle, '', metadata);
    } else {
      console.log(`%cREMOTE:CLIENT%c ${action}`, badgeStyle, '');
    }
  },
  error(action: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(`${ANSI_RED}[REMOTE:ERROR]${ANSI_RESET} ${action}: ${errorMsg}\n`);
    } else {
      console.error(`%cREMOTE:ERROR%c ${action}`, 'background: #dc2626; color: #fff; padding: 2px 6px;', '', error);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/remote/lib/logger.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/remote/lib/logger.ts apps/remote/lib/logger.test.mjs
git commit -m "feat(remote): add isomorphic tagged logger with stdout and console formatting"
```

---

### Task 3: Instrument Host Server-Side Communications

**Files:**
- Modify: `apps/host/lib/safeRemoteLoader.ts`
- Modify: `apps/host/pages/index.tsx`

**Interfaces:**
- Consumes: `hostLog.server`, `hostLog.error` from `apps/host/lib/logger.ts`

- [ ] **Step 1: Instrument safeRemoteLoader.ts**
Add logs for SSR fetch dispatch, successful response with latency, and timeout/error triggers.

```typescript
// apps/host/lib/safeRemoteLoader.ts
import { hostLog } from './logger';

// When starting fetch:
hostLog.server('SSR_FETCH_REMOTE_DATA_START', { url: apiUrl, timeoutMs, user: session?.userName });
const startTime = Date.now();

// When res 200 ends:
const latencyMs = Date.now() - startTime;
hostLog.server('SSR_FETCH_REMOTE_DATA_SUCCESS', { latencyMs, cached: json.cached, requestId: json.requestId });

// On timeout:
hostLog.server('SSR_FETCH_REMOTE_DATA_TIMEOUT', { timeoutMs, fallbackTriggered: true });

// On error:
hostLog.server('SSR_FETCH_REMOTE_DATA_ERROR', { error: 'Connection failed, triggering fallback' });
```

- [ ] **Step 2: Instrument getServerSideProps in host pages/index.tsx**
Log incoming SSR request lifecycle, requested route, session, and final render status.

```typescript
// apps/host/pages/index.tsx
hostLog.server('SSR_PAGE_RENDER_REQUEST', { route: initialRoute, tab: initialTab, user: session.userName });
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm --filter @mfe/host typecheck`
Expected: Exit code 0 with clean output

- [ ] **Step 4: Commit**

```bash
git add apps/host/lib/safeRemoteLoader.ts apps/host/pages/index.tsx
git commit -m "feat(host): add server-side stdout logging to SSR loader and page render"
```

---

### Task 4: Instrument Remote Server-Side Communications

**Files:**
- Modify: `apps/remote/pages/api/server-data.ts`
- Modify: `apps/remote/pages/api/sse-events.ts`

**Interfaces:**
- Consumes: `remoteLog.server`, `remoteLog.error` from `apps/remote/lib/logger.ts`

- [ ] **Step 1: Instrument server-data.ts**
Log incoming SSR data requests, session header parsing, and cache response status.

```typescript
// apps/remote/pages/api/server-data.ts
import { remoteLog } from '../../lib/logger';

remoteLog.server('API_SERVER_DATA_REQUEST', {
  user: session?.userName || 'anonymous',
  ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
});
// When returning data:
remoteLog.server('API_SERVER_DATA_RESPONDED', {
  cached: data.cached,
  requestId: data.requestId,
  origin: data.origin,
});
```

- [ ] **Step 2: Instrument sse-events.ts**
Log EventSource connection opening, periodic event broadcasting (with level and source), and client disconnection.

```typescript
// apps/remote/pages/api/sse-events.ts
import { remoteLog } from '../../lib/logger';

remoteLog.server('SSE_CLIENT_CONNECTED', {
  ip: req.socket.remoteAddress,
});

// Inside interval:
remoteLog.server('SSE_EVENT_BROADCAST', {
  id: event.id,
  level: event.level,
  source: event.source,
  value: event.value,
});

// Inside req.on('close'):
remoteLog.server('SSE_CLIENT_DISCONNECTED', {});
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm --filter @mfe/remote typecheck`
Expected: Exit code 0 with clean output

- [ ] **Step 4: Commit**

```bash
git add apps/remote/pages/api/server-data.ts apps/remote/pages/api/sse-events.ts
git commit -m "feat(remote): add server-side stdout logging to API endpoints and SSE stream"
```

---

### Task 5: Instrument Remote Client-Side Communications

**Files:**
- Modify: `apps/remote/lib/events.ts`
- Modify: `apps/remote/components/RemoteTelemetry.tsx`
- Modify: `apps/remote/components/ServerCard.tsx`
- Modify: `apps/remote/components/RemoteMap.tsx`

**Interfaces:**
- Consumes: `remoteLog.client` from `apps/remote/lib/logger.ts`

- [ ] **Step 1: Instrument events.ts**
Log all window CustomEvents dispatched by Remote (`mfe:toast`, `mfe:session-change`, `mfe:map-select`).

```typescript
// apps/remote/lib/events.ts
import { remoteLog } from './logger';

// in emitToast:
remoteLog.client('DISPATCH_MFE_TOAST', payload);

// in emitSessionChange:
remoteLog.client('DISPATCH_SESSION_CHANGE', session);

// in emitMapSelect:
remoteLog.client('DISPATCH_MAP_SELECT', { markerId: marker.id, name: marker.name });
```

- [ ] **Step 2: Instrument RemoteTelemetry.tsx**
Log SSE connection status changes (`connected`, `paused`, `error`) and event payload parsing.

```typescript
// apps/remote/components/RemoteTelemetry.tsx
import { remoteLog } from '../lib/logger';

// in onopen:
remoteLog.client('SSE_STREAM_CONNECTED', { sseUrl });
// in onmessage:
remoteLog.client('SSE_EVENT_RECEIVED', { id: payload.id, level: payload.level, source: payload.source });
// on pause / resume:
remoteLog.client('SSE_STREAM_TOGGLE_PAUSE', { isPaused: !prev });
```

- [ ] **Step 3: Instrument ServerCard.tsx and RemoteMap.tsx**
Log counter increments and map marker interactions.

```typescript
// apps/remote/components/ServerCard.tsx
remoteLog.client('ACTION_INCREMENT_COUNTER', { nextCount, user: activeSession?.userName });

// apps/remote/components/RemoteMap.tsx
remoteLog.client('MAP_MARKER_SELECTED', { id: marker.id, name: marker.name, coordinates: [marker.lat, marker.lng] });
remoteLog.client('MAP_FLY_TO', { name: marker.name });
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `pnpm --filter @mfe/remote typecheck`
Expected: Exit code 0 with clean output

- [ ] **Step 5: Commit**

```bash
git add apps/remote/lib/events.ts apps/remote/components/RemoteTelemetry.tsx apps/remote/components/ServerCard.tsx apps/remote/components/RemoteMap.tsx
git commit -m "feat(remote): add client-side console logging for events, SSE, and interactive components"
```

---

### Task 6: Instrument Host Client-Side Communications

**Files:**
- Modify: `apps/host/lib/events.ts`
- Modify: `apps/host/components/ToastContainer.tsx`
- Modify: `apps/host/components/Header.tsx`
- Modify: `apps/host/components/SideNavigation.tsx`
- Modify: `apps/host/pages/index.tsx`

**Interfaces:**
- Consumes: `hostLog.client` from `apps/host/lib/logger.ts`

- [ ] **Step 1: Instrument events.ts and ToastContainer.tsx**
Log dispatching toasts from Host and receiving toasts in `ToastContainer`.

```typescript
// apps/host/lib/events.ts
import { hostLog } from './logger';
hostLog.client('DISPATCH_MFE_TOAST', payload);

// apps/host/components/ToastContainer.tsx
import { hostLog } from '../lib/logger';
hostLog.client('RECEIVE_MFE_TOAST', { id: toast.id, title: toast.title, type: toast.type });
```

- [ ] **Step 2: Instrument Header.tsx, SideNavigation.tsx, and pages/index.tsx**
Log user session switching, tab switching, and remote module federation dynamic loading.

```typescript
// apps/host/components/Header.tsx
hostLog.client('SESSION_SWITCHED', { userId: selected.userId, user: selected.userName, role: selected.role });

// apps/host/components/SideNavigation.tsx
hostLog.client('NAVIGATE_TAB_CLICK', { tabId: item.id, label: item.label });

// apps/host/pages/index.tsx
hostLog.client('FEDERATION_LOAD_REMOTE_START', { module: 'remote/RemoteDashboard' });
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm --filter @mfe/host typecheck`
Expected: Exit code 0 with clean output

- [ ] **Step 4: Commit**

```bash
git add apps/host/lib/events.ts apps/host/components/ToastContainer.tsx apps/host/components/Header.tsx apps/host/components/SideNavigation.tsx apps/host/pages/index.tsx
git commit -m "feat(host): add client-side console logging for toast listener, nav, and federation"
```

---

### Task 7: Full Verification

**Files:**
- Verification only

- [ ] **Step 1: Run typechecks**

Run: `pnpm --filter @mfe/remote typecheck && pnpm --filter @mfe/host typecheck`
Expected: All TypeScript checks pass cleanly.

- [ ] **Step 2: Run logger unit tests**

Run: `node --test apps/host/lib/logger.test.mjs && node --test apps/remote/lib/logger.test.mjs`
Expected: Both test suites pass cleanly.

- [ ] **Step 3: Run PoC verification scripts**

Run: `pnpm build && pnpm verify:poc` (or run verify scripts against dev/built instances)
Expected: PoC checks pass and terminal outputs distinct tagged logs.

- [ ] **Step 4: Final commit and summary**

```bash
git add .
git commit -m "chore: verify mfe communication logging across host and remote"
```
