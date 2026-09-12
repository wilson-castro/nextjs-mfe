import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import HostLayout from '../components/HostLayout';
import { DEFAULT_SESSION, type UserSession } from '../lib/session';
import {
  ZONE_ERROR_TITLE,
  ZONE_ERROR_HEADING,
  ZONE_ERROR_MESSAGE,
  ZONE_ERROR_RETRY_HINT,
} from '../lib/zoneErrorContent';

/**
 * Reserved shell route (docs/design-bff/mfe/00-arquitetura.md §2.3,
 * 01-operacao.md §1.1/§5.1): "Zona inteira fora -> shell serve
 * `/erro-de-zona`" -- and it "precisa existir com toda zona fora" (must
 * exist even with the zone entirely down).
 *
 * Two ways this page is reached:
 *  1. Direct navigation to GET /erro-de-zona (this route, always available).
 *  2. Transparently, when middleware.ts detects the remote-app zone is down
 *     and short-circuits a /remote-app* request -- but that path is served
 *     by lib/zoneErrorPage.ts's renderZoneErrorHtml(), a plain HTML string,
 *     not by rendering this component (middleware runs before any Next.js
 *     page-rendering pipeline is available). The two share their copy via
 *     lib/zoneErrorContent.ts so they read as the same page.
 *
 * No getServerSideProps/getStaticProps, no fetch, no import that reaches
 * the zone or a domain layer: this page has zero runtime dependency on
 * anything that could be down, which is the whole point of it existing.
 */
const ErroDeZonaPage: NextPage = () => {
  const [session] = useState<UserSession>(DEFAULT_SESSION);

  return (
    <>
      <Head>
        <title>{ZONE_ERROR_TITLE}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <HostLayout currentSession={session} onSessionChange={() => {}}>
        <section className="host-section zone-error-page">
          <div className="zone-error-badge">
            <span className="status-dot dot-offline" />
            <span>Zone Offline</span>
          </div>
          <h2>{ZONE_ERROR_HEADING}</h2>
          <p className="status-text" style={{ marginTop: '0.75rem' }}>
            {ZONE_ERROR_MESSAGE}
          </p>
          <p className="status-text" style={{ marginTop: '0.5rem' }}>
            {ZONE_ERROR_RETRY_HINT}
          </p>
          <div className="interactive-section">
            <a href="/remote-app" className="action-btn" style={{ textDecoration: 'none' }}>
              Tentar novamente
            </a>
            <a href="/" className="secondary-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Voltar para o shell
            </a>
          </div>
        </section>
      </HostLayout>
    </>
  );
};

export default ErroDeZonaPage;
