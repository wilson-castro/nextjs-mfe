import http from 'node:http';
import type { ServerPayload } from 'remote/ServerCard';
import type { UserSession } from './session';
import { hostLog } from './logger';

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

      hostLog.server('SSR_FETCH_REMOTE_DATA_START', {
        url: apiUrl,
        timeoutMs,
        user: session?.userName || 'none',
      });
      const startTime = Date.now();

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
            hostLog.server('SSR_FETCH_REMOTE_DATA_BAD_STATUS', {
              statusCode: res.statusCode,
              fallbackTriggered: true,
            });
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
              const latencyMs = Date.now() - startTime;
              hostLog.server('SSR_FETCH_REMOTE_DATA_SUCCESS', {
                latencyMs,
                cached: json.cached,
                requestId: json.requestId,
              });
              resolve(json);
            } catch {
              hostLog.server('SSR_FETCH_REMOTE_DATA_PARSE_ERROR', {
                error: 'Invalid JSON payload from remote',
                fallbackTriggered: true,
              });
              resolve(null);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        hostLog.server('SSR_FETCH_REMOTE_DATA_TIMEOUT', {
          timeoutMs,
          fallbackTriggered: true,
        });
        resolve(null);
      });

      req.on('error', (err) => {
        hostLog.server('SSR_FETCH_REMOTE_DATA_ERROR', {
          error: err.message || 'Connection refused or socket error',
          fallbackTriggered: true,
        });
        resolve(null);
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      hostLog.server('SSR_FETCH_REMOTE_DATA_EXCEPTION', {
        error: errorMsg,
        fallbackTriggered: true,
      });
      resolve(null);
    }
  });
}
