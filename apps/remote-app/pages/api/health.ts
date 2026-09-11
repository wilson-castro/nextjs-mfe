import type { NextApiRequest, NextApiResponse } from 'next';

export interface HealthResponse {
  readonly ok: boolean;
}

/**
 * Health check endpoint for process liveness verification.
 * Zero domain I/O or database dependencies to ensure reliable probe response.
 *
 * @example
 * // GET /remote-app/api/health -> { ok: true }
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
): void {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  res.status(200).json({ ok: true });
}
