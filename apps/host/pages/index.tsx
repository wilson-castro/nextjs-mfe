import React, { lazy, Suspense } from 'react';
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import type { ServerPayload } from 'remote/ServerCard';
import FederatedErrorBoundary from '../components/FederatedErrorBoundary';
import RemoteFallbackCard from '../components/RemoteFallbackCard';
import { fetchRemoteServerData } from '../lib/safeRemoteLoader';

// Use React.lazy with native React 18/19 Suspense boundary for Module Federation in Next 15
const RemoteServerCard = lazy(() =>
  import('remote/ServerCard').catch((err: Error) => {
    console.warn('Failed to resolve remote/ServerCard:', err.message);
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
  readonly serverData?: ServerPayload | null;
  readonly isRemoteAvailable: boolean;
  readonly errorReason?: string;
  readonly hostRenderTimestamp: string;
}

const HostHomePage: NextPage<HostHomePageProps> = ({
  serverData,
  isRemoteAvailable,
  errorReason,
  hostRenderTimestamp,
}) => {
  return (
    <>
      <Head>
        <title>Host Micro-Frontend (Port 3000)</title>
        <meta name="description" content="Next.js Resilient Host Micro-Frontend with SSR" />
      </Head>

      <main className="container">
        <header className="host-header">
          <h1>Host Application</h1>
          <p>Resilient Next.js 15 Host running on port 3000 with fault-tolerant SSR federation.</p>
        </header>

        <section className="host-section">
          <h2>Host SSR Diagnostics</h2>
          <p className="status-text">
            Host Page Rendered at: <strong>{hostRenderTimestamp}</strong>
          </p>
          <p className="status-text">
            Remote Federation Status:{' '}
            <strong style={{ color: isRemoteAvailable ? '#38bdf8' : '#fbbf24' }}>
              {isRemoteAvailable ? 'Online & Rendered' : 'Offline / Degraded Mode'}
            </strong>
          </p>
        </section>

        <div className="remote-wrapper">
          <FederatedErrorBoundary fallbackMessage="Federated component runtime error">
            {isRemoteAvailable && serverData ? (
              <Suspense
                fallback={
                  <div className="federated-card">
                    <p className="fallback-text">Loading remote component...</p>
                  </div>
                }
              >
                <RemoteServerCard
                  initialData={serverData}
                  title="Remote Component Loaded via SSR in Host"
                />
              </Suspense>
            ) : (
              <RemoteFallbackCard
                reason={errorReason || 'Remote service is unavailable during SSR'}
              />
            )}
          </FederatedErrorBoundary>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<HostHomePageProps> = async () => {
  const hostRenderTimestamp = new Date().toISOString();

  // 1. Fetch remote server data with 800ms upper-bound timeout
  const serverData = await fetchRemoteServerData('http://localhost:3001/api/server-data', 800);

  if (serverData) {
    return {
      props: {
        serverData,
        isRemoteAvailable: true,
        hostRenderTimestamp,
      },
    };
  }

  return {
    props: {
      serverData: null,
      isRemoteAvailable: false,
      errorReason: 'Remote MFE (Port 3001) is offline or unreachable',
      hostRenderTimestamp,
    },
  };
};

export default HostHomePage;
