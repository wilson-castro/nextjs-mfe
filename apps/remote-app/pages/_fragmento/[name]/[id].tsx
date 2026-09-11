import type { NextApiRequest, NextApiResponse } from 'next';
import React from 'react';

const KNOWN_FRAGMENTS = new Set<string>(['demo']);

/**
 * Fragment endpoint for server-side HTML composition.
 * Returns inert HTML for known fragments, 204 for unknown (masking authorization),
 * and 405 for non-GET methods.
 *
 * Safely handles dual-role invocation: API route handler at runtime and
 * inert React component during Next.js build prerendering.
 *
 * @example
 * // GET /remote-app/_fragmento/demo/42 -> 200 text/html (no <script> tags)
 */
export default function handler(
  req: NextApiRequest,
  res?: NextApiResponse
): React.ReactElement | null | void {
  // When Next.js prerenders this page file during build, res is undefined
  if (!res || typeof res.status !== 'function') {
    return null;
  }

  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  let { name, id } = (req.query ?? {}) as { name?: string; id?: string };
  if ((!name || !id) && req.url) {
    const match = req.url.match(/(?:_fragmento|api\/fragmento)\/([^/?#]+)\/([^/?#]+)/);
    if (match) {
      try {
        name = name ?? decodeURIComponent(match[1]);
        id = id ?? decodeURIComponent(match[2]);
      } catch {
        name = name ?? match[1];
        id = id ?? match[2];
      }
    }
  }

  if (!name || !KNOWN_FRAGMENTS.has(name)) {
    res.status(204).end();
    return;
  }

  const safeId = encodeURIComponent(String(id ?? ''));

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .end(`<div class="fragment fragment--${name}"><p>Demo fragment (id: ${safeId})</p></div>`);
}
