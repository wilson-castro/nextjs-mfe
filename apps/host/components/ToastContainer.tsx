'use client';

import React, { useState, useEffect } from 'react';
import { MFE_EVENTS, type ToastPayload } from '../lib/events';
import { hostLog } from '../lib/logger';

const AUTO_DISMISS_MS = 4500;

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<readonly ToastPayload[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastPayload>;
      if (!customEvent.detail) return;

      const toast = customEvent.detail;
      hostLog.client('RECEIVE_MFE_TOAST', {
        id: toast.id,
        title: toast.title,
        type: toast.type,
      });

      setToasts((prev) => [...prev, toast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    };

    window.addEventListener(MFE_EVENTS.TOAST, handleToastEvent);
    return () => {
      window.removeEventListener(MFE_EVENTS.TOAST, handleToastEvent);
    };
  }, []);

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <aside aria-live="polite" className="toast-portal">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card toast-${toast.type}`}>
          <div className="toast-content">
            <strong className="toast-title">{toast.title}</strong>
            <p className="toast-message">{toast.message}</p>
            <time className="toast-time">{new Date(toast.timestamp).toLocaleTimeString()}</time>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => handleDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </aside>
  );
};

export default ToastContainer;
