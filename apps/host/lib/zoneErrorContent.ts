/**
 * Copy shared between the standalone `/erro-de-zona` page
 * (pages/erro-de-zona.tsx, reached by direct navigation) and the middleware
 * outage fallback (lib/zoneErrorPage.ts, reached when a zone request is
 * short-circuited). Single-sourcing the text keeps the two render paths
 * from drifting apart even though they render through different mechanisms
 * (React JSX vs. a plain HTML string -- see lib/zoneErrorPage.ts for why).
 */

export const ZONE_ERROR_TITLE = 'Zona Indisponível';

export const ZONE_ERROR_HEADING = 'Zona indisponível';

export const ZONE_ERROR_MESSAGE =
  'A zona remota está temporariamente fora do ar. O shell continua funcionando normalmente; ' +
  'esta seção específica volta assim que o processo da zona for restabelecido.';

export const ZONE_ERROR_RETRY_HINT = 'Tente novamente em alguns instantes.';
