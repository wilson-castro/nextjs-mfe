'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { RemoteTelemetryProps, TelemetryEvent } from '../types';
import { emitToast } from '../lib/events';
import { remoteLog } from '../lib/logger';

const MAX_BUFFER_SIZE = 8;

export const RemoteTelemetry: React.FC<RemoteTelemetryProps> = ({
  filterLevel = 'all',
  maxEvents = MAX_BUFFER_SIZE,
  session,
}) => {
  const [events, setEvents] = useState<readonly TelemetryEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'paused' | 'error'>('connecting');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (isPaused) {
      eventSourceRef.current?.close();
      setStatus('paused');
      remoteLog.client('SSE_STREAM_PAUSED', { isPaused: true });
      return;
    }

    const sseUrl = typeof window !== 'undefined' && window.location.port === '3001'
      ? '/api/sse-events'
      : 'http://localhost:3001/api/sse-events';

    remoteLog.client('SSE_STREAM_CONNECTING', { sseUrl });
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
      remoteLog.client('SSE_STREAM_CONNECTED', { sseUrl });
    };

    es.onerror = () => {
      setStatus('error');
      remoteLog.client('SSE_STREAM_ERROR', { sseUrl });
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload: TelemetryEvent = JSON.parse(event.data);
        if (!payload.id) return;

        remoteLog.client('SSE_EVENT_RECEIVED', {
          id: payload.id,
          level: payload.level,
          source: payload.source,
          value: payload.value,
        });

        setEvents((prev) => [payload, ...prev.slice(0, maxEvents - 1)]);

        if (payload.level === 'critical') {
          emitToast('Critical SSE Alert', `${payload.source}: ${payload.message}`, 'error');
        }
      } catch (err) {
        remoteLog.error('SSE_PARSE_ERROR', err);
      }
    };

    return () => {
      remoteLog.client('SSE_STREAM_CLOSED', { sseUrl });
      es.close();
    };
  }, [isPaused, maxEvents]);

  const filtered = filterLevel === 'all' ? events : events.filter((e) => e.level === filterLevel);

  return (
    <div className="federated-card telemetry-card">
      <header className="federated-card-header">
        <span className="badge">Remote SSE Stream</span>
        <h3 className="card-title">Live Server-Sent Events Telemetry</h3>
        <span className={`status-indicator status-${status}`}>
          ● {status.toUpperCase()}
        </span>
      </header>

      <div className="card-body">
        {session && (
          <p className="session-info-small">
            Connected as: <strong>{session.userName}</strong> ({session.role})
          </p>
        )}

        <div className="telemetry-controls">
          <button
            type="button"
            className="action-btn"
            onClick={() => setIsPaused((prev) => !prev)}
          >
            {isPaused ? '▶ Resume SSE Stream' : '⏸ Pause SSE Stream'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setEvents([])}
          >
            Clear Log
          </button>
        </div>

        <div className="events-stream-list">
          {filtered.length === 0 ? (
            <p className="fallback-text">
              {status === 'connecting' ? 'Connecting to remote SSE stream...' : 'No telemetry events received yet.'}
            </p>
          ) : (
            filtered.map((evt) => (
              <div key={evt.id} className={`event-row event-${evt.level}`}>
                <div className="event-meta">
                  <span className={`level-badge level-${evt.level}`}>{evt.level}</span>
                  <span className="event-source">{evt.source}</span>
                  <time className="event-time">{new Date(evt.timestamp).toLocaleTimeString()}</time>
                </div>
                <div className="event-msg">{evt.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoteTelemetry;
