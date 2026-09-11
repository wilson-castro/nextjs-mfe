import React, { useState, useEffect } from 'react';
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import HostLayout from '../components/HostLayout';
import {
  DEFAULT_SESSION,
  getSessionFromStorage,
  saveSessionToStorage,
  type UserSession,
} from '../lib/session';
import { hostLog } from '../lib/logger';

interface HostHomePageProps {
  readonly hostRenderTimestamp: string;
  readonly initialSession: UserSession;
  readonly initialRoute: string;
}

const HostHomePage: NextPage<HostHomePageProps> = ({
  hostRenderTimestamp,
  initialSession,
  initialRoute,
}) => {
  const [currentSession, setCurrentSession] = useState<UserSession>(initialSession);

  useEffect(() => {
    const saved = getSessionFromStorage();
    if (saved.userId !== initialSession.userId) {
      setCurrentSession(saved);
    }
  }, [initialSession]);

  const handleSessionChange = (nextSession: UserSession) => {
    hostLog.client('HOST_SESSION_UPDATED', {
      user: nextSession.userName,
      role: nextSession.role,
    });
    setCurrentSession(nextSession);
    saveSessionToStorage(nextSession);
  };

  return (
    <>
      <Head>
        <title>Enterprise Multi-Zones Shell</title>
        <meta
          name="description"
          content="Next.js Multi-Zones Shell Gateway with HTTP routing, session coordination, and telemetry"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <HostLayout currentSession={currentSession} onSessionChange={handleSessionChange}>
        <section className="host-section">
          <div className="section-header-flex">
            <div>
              <h2>Shell Runtime Diagnostics</h2>
              <p className="status-text">
                SSR Rendered at: <strong>{hostRenderTimestamp}</strong>
              </p>
            </div>
            <div className="active-route-pill">
              Route: <code>{initialRoute}</code>
            </div>
          </div>

          <dl className="data-grid" style={{ marginTop: '1.25rem' }}>
            <div className="data-row">
              <dt>Architecture Pattern</dt>
              <dd className="data-value highlight">Next.js Multi-Zones Gateway</dd>
            </div>
            <div className="data-row">
              <dt>Shell Gateway Port</dt>
              <dd className="data-value mono">3000</dd>
            </div>
            <div className="data-row">
              <dt>Zone 2 Rewrite Rule</dt>
              <dd className="data-value mono">/remote-app &rarr; :3001/remote-app</dd>
            </div>
            <div className="data-row">
              <dt>Zone Static Assets Rule</dt>
              <dd className="data-value mono">/remote-app-static/:path* &rarr; :3001/remote-app-static/:path*</dd>
            </div>
            <div className="data-row">
              <dt>Active Session</dt>
              <dd className="data-value">
                {currentSession.userName} ({currentSession.role})
              </dd>
            </div>
          </dl>
        </section>

        <section className="host-section">
          <h2>Connected Zones</h2>
          <p className="status-text" style={{ marginBottom: '1.25rem' }}>
            Multi-Zones runs autonomous Next.js applications behind the host shell gateway.
            Cross-zone navigation triggers full browser document loads to ensure clean runtime isolation.
          </p>

          <div className="federated-card" style={{ background: '#0f172a', borderColor: '#1e293b' }}>
            <div className="federated-card-header">
              <span className="badge">Zone 2</span>
              <h3 className="card-title">Remote App Zone</h3>
            </div>
            <p className="status-text" style={{ marginBottom: '1rem' }}>
              Autonomous Next.js zone serving under <code>basePath: &apos;/remote-app&apos;</code> with dedicated BFF and static asset prefixes.
            </p>
            {/* Architectural invariant: cross-zone link MUST use plain HTML <a>, NEVER Next.js <Link> */}
            <a
              href="/remote-app"
              className="action-btn"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              Open Remote App Zone &rarr;
            </a>
          </div>
        </section>
      </HostLayout>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<HostHomePageProps> = async (context) => {
  const hostRenderTimestamp = new Date().toISOString();
  const session = DEFAULT_SESSION;
  const initialRoute = context.resolvedUrl || '/';

  // Shell contains zero DAL/business data fetches — only shell runtime metadata
  hostLog.server('SSR_PAGE_RENDER', {
    route: initialRoute,
    user: session.userName,
  });

  return {
    props: {
      hostRenderTimestamp,
      initialSession: session,
      initialRoute,
    },
  };
};

export default HostHomePage;
