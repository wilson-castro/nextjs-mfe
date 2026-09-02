import type { NextApiRequest, NextApiResponse } from 'next';
import type { TelemetryEvent } from '../../types';
import { remoteLog } from '../../lib/logger';

const SOURCES = ['sensor-alpha', 'gateway-east', 'db-pool', 'auth-worker'] as const;
const LEVELS: readonly TelemetryEvent['level'][] = ['info', 'info', 'warn', 'critical'];

function generateEvent(): TelemetryEvent {
  const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
  const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
  const value = Math.round((Math.random() * 100 + 20) * 10) / 10;
  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  return {
    id,
    timestamp: new Date().toISOString(),
    level,
    source,
    message: `${source} telemetry broadcast (load: ${value}%)`,
    value,
  };
}

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  remoteLog.server('SSE_CLIENT_CONNECTED', {
    ip: req.socket.remoteAddress || 'unknown',
  });

  // Send initial connected ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', ts: Date.now() })}\n\n`);

  const intervalId = setInterval(() => {
    const event = generateEvent();
    remoteLog.server('SSE_EVENT_BROADCAST', {
      id: event.id,
      level: event.level,
      source: event.source,
      value: event.value,
    });
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }, 1500);

  req.on('close', () => {
    remoteLog.server('SSE_CLIENT_DISCONNECTED', {
      ip: req.socket.remoteAddress || 'unknown',
    });
    clearInterval(intervalId);
    res.end();
  });
}
