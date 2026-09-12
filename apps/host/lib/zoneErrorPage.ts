import {
  ZONE_ERROR_TITLE,
  ZONE_ERROR_HEADING,
  ZONE_ERROR_MESSAGE,
  ZONE_ERROR_RETRY_HINT,
} from './zoneErrorContent.ts';

/**
 * Renders the fully standalone HTML document middleware.ts serves in place
 * of the bare Node 500 when a zone request is short-circuited (F1).
 *
 * This is a plain string, not a rendered React tree, on purpose:
 * middleware.ts runs in the Edge runtime by default, before any Next.js
 * page-rendering pipeline is available, and this repo may not add any new
 * dependency (no react-dom/server-in-edge helper). The visual language --
 * colors, spacing, typography -- mirrors apps/host/styles/globals.css
 * (dark shell theme, `--accent-remote`, the offline status dot) so the
 * fallback reads as the same product as pages/erro-de-zona.tsx, even though
 * the two are rendered through different mechanisms. The copy itself is
 * imported from lib/zoneErrorContent.ts, the single source of truth shared
 * with the standalone page, so the two cannot drift out of text sync.
 *
 * Deliberately inert: no <script>, no fetch, no reference to the zone's own
 * origin -- this document must render even though the very thing it is
 * reporting on is unreachable.
 */
export function renderZoneErrorHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${ZONE_ERROR_TITLE}</title>
<style>
  :root {
    --bg-color: #030712;
    --host-card-bg: #111827;
    --text-color: #f9fafb;
    --text-muted: #9ca3af;
    --border-color: #1f2937;
    --accent-remote: #38bdf8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .zone-error-card {
    max-width: 32rem;
    width: 100%;
    background: var(--host-card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
  }
  .zone-error-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #ef4444;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  .zone-error-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    display: inline-block;
  }
  h1 {
    font-size: 1.4rem;
    color: var(--accent-remote);
    margin-bottom: 0.75rem;
  }
  p {
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }
  a {
    color: var(--accent-remote);
  }
</style>
</head>
<body>
<main class="zone-error-page">
  <section class="zone-error-card">
    <span class="zone-error-badge"><span class="zone-error-dot"></span>Zone Offline</span>
    <h1>${ZONE_ERROR_HEADING}</h1>
    <p>${ZONE_ERROR_MESSAGE}</p>
    <p>${ZONE_ERROR_RETRY_HINT}</p>
    <p><a href="/">Voltar para o shell</a></p>
  </section>
</main>
</body>
</html>
`;
}
