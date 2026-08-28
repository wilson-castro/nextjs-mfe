'use client';

import React, { useState } from 'react';
import type { ServerCardProps } from '../types';

/**
 * Server-Rendered Federated Component.
 * Receives initial server payload during SSR and hydrates with client interactivity.
 *
 * @example
 * ```tsx
 * <ServerCard initialData={data} title="SSR Remote Card" />
 * ```
 */
export const ServerCard: React.FC<ServerCardProps> = ({
  initialData,
  title = 'Remote SSR Federated Card',
}) => {
  const [clickCount, setClickCount] = useState<number>(0);

  const handleIncrement = (): void => {
    setClickCount((prev) => prev + 1);
  };

  return (
    <div className="federated-card">
      <header className="federated-card-header">
        <span className="badge">Federated Remote Component</span>
        <h3 className="card-title">{title}</h3>
      </header>

      <div className="card-body">
        {initialData ? (
          <dl className="data-grid">
            <div className="data-row">
              <dt>SSR Render Source:</dt>
              <dd className="data-value highlight">{initialData.origin}</dd>
            </div>
            <div className="data-row">
              <dt>Server Timestamp:</dt>
              <dd className="data-value">{initialData.timestamp}</dd>
            </div>
            <div className="data-row">
              <dt>Node.js Runtime:</dt>
              <dd className="data-value">{initialData.serverNodeVersion}</dd>
            </div>
            <div className="data-row">
              <dt>SSR Request ID:</dt>
              <dd className="data-value mono">{initialData.requestId}</dd>
            </div>
            <div className="data-row">
              <dt>Server Memory / Platform:</dt>
              <dd className="data-value">
                {initialData.metrics.memoryUsageMb} MB heap ({initialData.metrics.platform} - {initialData.metrics.cpuArch})
              </dd>
            </div>
          </dl>
        ) : (
          <p className="fallback-text">No SSR data provided. Rendering in client mode.</p>
        )}

        <div className="interactive-section">
          <p className="status-text">
            Client Hydration Status: <strong>Active</strong> (Interactions: {clickCount})
          </p>
          <button
            type="button"
            className="action-btn"
            onClick={handleIncrement}
            data-testid="remote-increment-button"
          >
            Increment Counter (+1)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServerCard;
