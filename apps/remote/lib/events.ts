import type { ToastPayload, UserSession, MapMarker } from '../types';

export const MFE_EVENTS = {
  TOAST: 'mfe:toast',
  SESSION_CHANGE: 'mfe:session-change',
  MAP_SELECT: 'mfe:map-select',
} as const;

/**
 * Dispatches a toast notification to the host application.
 */
export function emitToast(
  title: string,
  message: string,
  type: ToastPayload['type'] = 'info'
): void {
  if (typeof window === 'undefined') return;

  const payload: ToastPayload = {
    id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title,
    message,
    type,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(MFE_EVENTS.TOAST, { detail: payload }));
}

/**
 * Dispatches a session update across micro-frontends.
 */
export function emitSessionChange(session: UserSession): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MFE_EVENTS.SESSION_CHANGE, { detail: session }));
}

/**
 * Dispatches a map selection event to synchronize navigation across MFEs.
 */
export function emitMapSelect(marker: MapMarker): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MFE_EVENTS.MAP_SELECT, { detail: marker }));
}
