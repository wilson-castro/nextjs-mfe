import React, { lazy, Suspense, useState, useEffect } from 'react';
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import type { ServerPayload } from 'remote/ServerCard';
import FederatedErrorBoundary from '../components/FederatedErrorBoundary';
import RemoteFallbackCard from '../components/RemoteFallbackCard';
import HostLayout from '../components/HostLayout';
import { fetchRemoteServerData } from '../lib/safeRemoteLoader';
import { DEFAULT_SESSION, getSessionFromStorage, saveSessionToStorage, type UserSession } from '../lib/session';

const RemoteDashboard = lazy(() =>
  import('remote/RemoteDashboard').catch((err: Error) => {
    console.warn('Failed to resolve remote/RemoteDashboard:', err.message);
    return {
      default: () => (
        <RemoteFallbackCard
          reason={`Module load error: ${err.message || 'Remote bundle unavailable'}`}
        />
      ),
    };
  })
);

interface HostHomePageProps {
  readonly serverData: ServerPayload | null;
  readonly isRemoteAvailable: boolean;
  readonly errorReason: string | null;
  readonly hostRenderTimestamp: string;
  readonly initialSession: UserSession;
  readonly initialTab: string;
  readonly initialFilter: string | null;
  readonly initialCity: string | null;
  readonly initialRoute: string;
}

const HostHomePage: NextPage<HostHomePageProps> = ({
  serverData,
  isRemoteAvailable,
  errorReason,
  hostRenderTimestamp,
  initialSession,
  initialTab,
  initialFilter,
  initialCity,
  initialRoute,
}) => {
  const [currentSession, setCurrentSession] = useState<UserSession>(initialSession);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [currentRoute, setCurrentRoute] = useState<string>(initialRoute);

  useEffect(() => {
    const saved = getSessionFromStorage();
    if (saved.userId !== initialSession.userId) {
      setCurrentSession(saved);
    }
  }, [initialSession]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const nextRoute = `/?tab=${tabId}`;
    setCurrentRoute(nextRoute);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', nextRoute);
    }
  };

  const handleSessionChange = (nextSession: UserSession) => {
    setCurrentSession(nextSession);
    saveSessionToStorage(nextSession);
  };

  const filterQuery = initialFilter || undefined;
  const cityQuery = initialCity || undefined;

  return (
    <>
      <Head>
        <title>Enterprise MFE Host Shell</title>
        <meta name="description" content="Next.js Resilient Host Micro-Frontend with SSR, MapLibre, and SSE" />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
        />
      </Head>

      <HostLayout
        currentTab={activeTab}
        currentSession={currentSession}
        onSessionChange={handleSessionChange}
        isRemoteAvailable={isRemoteAvailable}
        onTabSelect={handleTabChange}
      >
        <section className="host-section">
          <div className="section-header-flex">
            <div>
              <h2>Host Shell Runtime Diagnostics</h2>
              <p className="status-text">
                SSR Rendered at: <strong>{hostRenderTimestamp}</strong>
              </p>
            </div>
            <div className="active-route-pill">
              Route: <code>{currentRoute}</code>
            </div>
          </div>
        </section>

        <div className="remote-slot-wrapper">
          <FederatedErrorBoundary fallbackMessage="Federated component runtime error">
            {isRemoteAvailable && serverData ? (
              <Suspense
                fallback={
                  <div className="federated-card">
                    <p className="fallback-text">Hydrating remote micro-frontend module...</p>
                  </div>
                }
              >
                <RemoteDashboard
                  activeTab={activeTab as any}
                  serverData={serverData}
                  session={currentSession}
                  queryParams={{
                    filter: filterQuery as any,
                    city: cityQuery,
                  }}
                />
              </Suspense>
            ) : (
              <RemoteFallbackCard
                reason={errorReason || 'Remote MFE (Port 3001) is offline or unreachable'}
              />
            )}
          </FederatedErrorBoundary>
        </div>
      </HostLayout>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<HostHomePageProps> = async (context) => {
  const hostRenderTimestamp = new Date().toISOString();
  const session = DEFAULT_SESSION;
  const initialTab = typeof context.query.tab === 'string' ? context.query.tab : 'overview';
  const initialFilter = typeof context.query.filter === 'string' ? context.query.filter : null;
  const initialCity = typeof context.query.city === 'string' ? context.query.city : null;
  const initialRoute = context.resolvedUrl || '/';

  // 1. Fetch remote server data with 800ms upper-bound timeout and session headers
  const serverData = await fetchRemoteServerData('http://localhost:3001/api/server-data', 800, session);

  const baseProps = {
    hostRenderTimestamp,
    initialSession: session,
    initialTab,
    initialFilter,
    initialCity,
    initialRoute,
  };

  if (serverData) {
    return {
      props: {
        ...baseProps,
        serverData,
        isRemoteAvailable: true,
        errorReason: null,
      },
    };
  }

  return {
    props: {
      ...baseProps,
      serverData: null,
      isRemoteAvailable: false,
      errorReason: 'Remote MFE (Port 3001) is offline or unreachable during SSR',
    },
  };
};

export default HostHomePage;
