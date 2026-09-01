import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerData } from '../../lib/getServerData';
import type { ServerPayload, UserSession } from '../../types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ServerPayload | { error: string }>
): Promise<void> {
  try {
    const sessionHeader = req.headers['x-user-session'];
    let session: UserSession | undefined;
    if (typeof sessionHeader === 'string') {
      try {
        session = JSON.parse(sessionHeader);
      } catch {
        // Invalid session header, ignore
      }
    }

    const data = await getServerData(session);
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'x-user-session, Content-Type');
    res.status(200).json(data);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch server data';
    res.status(500).json({ error: errorMsg });
  }
}
