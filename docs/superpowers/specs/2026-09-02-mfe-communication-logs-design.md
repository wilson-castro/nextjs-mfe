# Design Document: MFE Client and Server Communication Logging

## Context & Purpose
In this Micro-Frontend (MFE) Proof-of-Concept based on Next.js 15 and Module Federation, multiple communication channels exist across the Host Shell (Port 3000) and the Remote Provider (Port 3001):
1. Server-Side SSR HTTP fetching with timeout & headers (`safeRemoteLoader` -> `/api/server-data`)
2. Server-Side real-time streaming via Server-Sent Events (`/api/sse-events` -> `RemoteTelemetry`)
3. Client-Side cross-MFE CustomEvents on the `window` (`mfe:toast`, `mfe:session-change`, `mfe:map-select`)
4. Client-Side Module Federation dynamic loading and component hydration
5. Host Shell navigation and session state propagation to Remote components

The goal is to provide clear, human-readable logging in both:
- **Terminal stdout (Node.js)**: tracking server-to-server and server-to-client operations.
- **Browser console**: tracking client-side state transitions, event bus dispatches, and stream reception.

## Architecture

### Isomorphic Logger Utilities
Two lightweight, zero-dependency loggers will be introduced:
- `apps/host/lib/logger.ts` (Host MFE scope, tagged `HOST`)
- `apps/remote/lib/logger.ts` (Remote MFE scope, tagged `REMOTE`)

Each logger detects the runtime environment (`typeof window === 'undefined' ? 'SERVER' : 'CLIENT'`):
- **Server / Terminal (`stdout`)**:
  - Uses ANSI color escapes:
    - Host Server: Magenta (`\x1b[35m[HOST:SERVER]\x1b[0m`)
    - Remote Server: Cyan (`\x1b[36m[REMOTE:SERVER]\x1b[0m`)
  - Writes directly to standard output with structured metadata (ISO timestamp, operation, duration/latency, payload overview).
- **Client / Browser (`console`)**:
  - Uses styled console output (`%c[HOST:CLIENT]`, `%c[REMOTE:CLIENT]`) with distinct badge backgrounds:
    - Host Client: Purple badge (`#6b21a8`)
    - Remote Client: Cyan badge (`#0891b2`)
  - Prints message along with readable payload object.

## Detailed Instrumentation Points

### 1. Host Server-Side (stdout)
- `apps/host/lib/safeRemoteLoader.ts`:
  - Log when starting remote data fetch: URL, timeout, target session.
  - Log on successful HTTP 200 response: status code, latency (ms), cache hit status from Remote.
  - Log on timeout or error: destruction reason, fallback trigger.
- `apps/host/pages/index.tsx`:
  - In `getServerSideProps`: Log incoming SSR request, requested route/tab, session profile, and whether remote data was supplied or fell back.

### 2. Remote Server-Side (stdout)
- `apps/remote/pages/api/server-data.ts`:
  - Log incoming request from Host, parsed `x-user-session` header.
  - Log response generation: cached status (`Hit` vs `Miss`), computation duration, response status.
- `apps/remote/pages/api/sse-events.ts`:
  - Log when SSE client initiates EventSource connection (`Connection established`).
  - Log periodic telemetry event generation: event ID, source, level (`warn`/`critical`/`info`), metric value.
  - Log on client connection close: stream termination and timer cleanup.

### 3. Host Client-Side (Browser Console)
- `apps/host/lib/events.ts` & `apps/host/components/Header.tsx`:
  - Log dispatching `mfe:toast` or session updates from the Host header.
- `apps/host/components/ToastContainer.tsx`:
  - Log receiving `mfe:toast` CustomEvents from the Remote MFE.
- `apps/host/components/SideNavigation.tsx` & `apps/host/pages/index.tsx`:
  - Log tab switching and route history updates (`/?tab=...`).
  - Log Remote component module federation resolution and hydration.

### 4. Remote Client-Side (Browser Console)
- `apps/remote/lib/events.ts`:
  - Log dispatching `mfe:toast`, `mfe:session-change`, and `mfe:map-select` events.
- `apps/remote/components/RemoteTelemetry.tsx`:
  - Log EventSource state changes (`connecting`, `connected`, `paused`, `error`).
  - Log receiving SSE events (with level badge) and triggering critical alert toasts.
- `apps/remote/components/ServerCard.tsx`:
  - Log counter increment button clicks and toast emission.
- `apps/remote/components/RemoteMap.tsx`:
  - Log MapLibre GL initialization, marker click selection, and fly-to navigation.

## Verification & Testing
- Use `pnpm --filter @mfe/remote typecheck` and `pnpm --filter @mfe/host typecheck`.
- Execute verification scripts `node scripts/verify-poc.mjs` and `node scripts/verify-ssr.mjs`.
- Test runtime server logs and browser console logs to verify that all events show clean, tagged, unswallowed logs.
