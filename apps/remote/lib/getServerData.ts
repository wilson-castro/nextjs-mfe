import type { ServerPayload } from '../types';

/**
 * Generates server-side diagnostic and runtime payload.
 * Executed on Node.js server during SSR / getServerSideProps.
 *
 * @example
 * ```ts
 * const data = await getServerData();
 * ```
 */
export async function getServerData(): Promise<ServerPayload> {
  const isServer = typeof window === 'undefined';
  const memory = isServer && typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : null;
  const memoryUsageMb = memory ? Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100 : 0;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    origin: 'Remote Application (Port 3001)',
    timestamp: new Date().toISOString(),
    serverNodeVersion: isServer && typeof process !== 'undefined' ? process.version : 'browser-client',
    requestId,
    metrics: {
      cpuArch: isServer && typeof process !== 'undefined' ? process.arch : 'unknown',
      platform: isServer && typeof process !== 'undefined' ? process.platform : 'browser',
      memoryUsageMb,
    },
  };
}

export default getServerData;
