import type { ToastPayload, UserSession, MapMarker } from '../types';
import { remoteLog } from './logger';

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

  remoteLog.client('DISPATCH_MFE_TOAST', {
    id: payload.id,
    title: payload.title,
    type: payload.type,
  });

  window.dispatchEvent(new CustomEvent(MFE_EVENTS.TOAST, { detail: payload }));
}

/**
 * Dispatches a session update across micro-frontends.
 */
export function emitSessionChange(session: UserSession): void {
  if (typeof window === 'undefined') return;

  remoteLog.client('DISPATCH_SESSION_CHANGE', {
    userId: session.userId,
    userName: session.userName,
    role: session.role,
  });

  window.dispatchEvent(new CustomEvent(MFE_EVENTS.SESSION_CHANGE, { detail: session }));
}

/**
 * Dispatches a map selection event to synchronize navigation across MFEs.
 */
export function emitMapSelect(marker: MapMarker): void {
  if (typeof window === 'undefined') return;

  remoteLog.client('DISPATCH_MAP_SELECT', {
    markerId: marker.id,
    name: marker.name,
    status: marker.status,
  });

  window.dispatchEvent(new CustomEvent(MFE_EVENTS.MAP_SELECT, { detail: marker }));
}
