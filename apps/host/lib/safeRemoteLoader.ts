import http from 'node:http';
import type { ServerPayload } from 'remote/ServerCard';
import type { UserSession } from './session';

export function fetchRemoteServerData(
  apiUrl: string = 'http://localhost:3001/api/server-data',
  timeoutMs: number = 800,
  session?: UserSession
): Promise<ServerPayload | null> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(apiUrl);
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache',
        Accept: 'application/json',
      };

      if (session) {
        headers['x-user-session'] = JSON.stringify(session);
      }

      const req = http.get(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 80,
          path: parsedUrl.pathname + parsedUrl.search,
          timeout: timeoutMs,
          headers,
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
