import http from 'node:http';
import type { ServerPayload } from 'remote/ServerCard';

/**
 * Fetches remote SSR payload directly over HTTP with strict timeout and no-cache headers.
 * Bypasses Node.js module caching pitfalls when remotes go offline and come back online.
 *
 * @param apiUrl - URL to the remote server data endpoint
 * @param timeoutMs - Maximum milliseconds to wait (default 800ms)
 */
export function fetchRemoteServerData(
  apiUrl: string = 'http://localhost:3001/api/server-data',
  timeoutMs: number = 800
): Promise<ServerPayload | null> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(apiUrl);
      const req = http.get(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 80,
          path: parsedUrl.pathname + parsedUrl.search,
          timeout: timeoutMs,
          headers: {
            'Cache-Control': 'no-cache',
            Accept: 'application/json',
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(null);
            return;
          }

          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(rawData) as ServerPayload;
              resolve(json);
            } catch {
              resolve(null);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.on('error', () => {
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}
