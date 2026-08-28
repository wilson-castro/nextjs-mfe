import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerData } from '../../lib/getServerData';
import type { ServerPayload } from '../../types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ServerPayload | { error: string }>
) {
  try {
    const data = await getServerData();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json(data);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch server data';
    res.status(500).json({ error: errorMsg });
  }
}
