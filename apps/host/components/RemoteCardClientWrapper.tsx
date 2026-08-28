'use client';

import React, { lazy, Suspense } from 'react';
import type { ServerPayload } from 'remote/ServerCard';
import FederatedErrorBoundary from './FederatedErrorBoundary';
import RemoteFallbackCard from './RemoteFallbackCard';

// Dynamically load remote federated component on the client boundary
const RemoteServerCard = lazy(() =>
  import('remote/ServerCard').catch((err: Error) => {
    console.warn('Failed to resolve federated remote/ServerCard:', err.message);
    return {
      default: () => (
        <RemoteFallbackCard
          reason={`Module load error: ${err.message || 'Remote bundle unavailable'}`}
        />
      ),
    };
  })
);

interface RemoteCardClientWrapperProps {
  readonly initialData: ServerPayload;
  readonly title?: string;
}

export const RemoteCardClientWrapper: React.FC<RemoteCardClientWrapperProps> = ({
  initialData,
  title = 'Remote Component Loaded via SSR in Host (App Router)',
}) => {
  return (
    <FederatedErrorBoundary fallbackMessage="Federated component client runtime error">
      <Suspense
        fallback={
          <div className="federated-card">
            <p className="fallback-text">Loading remote component...</p>
          </div>
        }
      >
        <RemoteServerCard initialData={initialData} title={title} />
      </Suspense>
    </FederatedErrorBoundary>
  );
};

export default RemoteCardClientWrapper;
