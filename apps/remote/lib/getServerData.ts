import type { ServerPayload, UserSession } from '../types';
import { getOrSetCache } from './cache';

const DEFAULT_CACHE_TTL_MS = 5000;

async function computeDiagnostics(session?: UserSession): Promise<ServerPayload> {
  const isServer = typeof window === 'undefined';
  const memory = isServer && typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : null;
  const memoryUsageMb = memory ? Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100 : 0;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    origin: 'Remote Application (Port 3001)',
    timestamp: new Date().toISOString(),
    serverNodeVersion: isServer && typeof process !== 'undefined' ? process.version : 'browser-client',
    requestId,
    session,
    metrics: {
      cpuArch: isServer && typeof process !== 'undefined' ? process.arch : 'unknown',
      platform: isServer && typeof process !== 'undefined' ? process.platform : 'browser',
      memoryUsageMb,
    },
  };
}

/**
 * Generates server-side diagnostic payload with optional session and caching.
 */
export async function getServerData(session?: UserSession): Promise<ServerPayload> {
  const cacheKey = `server_data_${session?.userId || 'anonymous'}`;
  const { data, cached } = await getOrSetCache(cacheKey, DEFAULT_CACHE_TTL_MS, () =>
    computeDiagnostics(session)
  );

  return {
    ...data,
    cached,
  };
}

export default getServerData;
