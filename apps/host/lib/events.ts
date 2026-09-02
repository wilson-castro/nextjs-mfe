import { hostLog } from './logger';

export interface ToastPayload {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly type: 'info' | 'success' | 'warning' | 'error';
  readonly timestamp: number;
}

export const MFE_EVENTS = {
  TOAST: 'mfe:toast',
  SESSION_CHANGE: 'mfe:session-change',
  MAP_SELECT: 'mfe:map-select',
} as const;

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

  hostLog.client('DISPATCH_MFE_TOAST', {
    id: payload.id,
    title: payload.title,
    type: payload.type,
  });

  window.dispatchEvent(new CustomEvent(MFE_EVENTS.TOAST, { detail: payload }));
}
