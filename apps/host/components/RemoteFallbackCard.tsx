'use client';

import React from 'react';

interface RemoteFallbackCardProps {
  readonly reason?: string;
  readonly onRetry?: () => void;
}

/**
 * Fallback UI displayed when the Remote Micro-Frontend is offline,
 * unreachable, or encounters an unhandled runtime exception.
 */
export const RemoteFallbackCard: React.FC<RemoteFallbackCardProps> = ({
  reason = 'Remote service is currently unavailable or unreachable.',
  onRetry,
}) => {
  return (
    <div className="federated-card fallback-card" role="alert">
      <div className="federated-card-header fallback-header">
        <span className="badge badge-warning">Fallback Mode</span>
        <h3 className="card-title">Remote Service Unavailable</h3>
      </div>
      <div className="card-body">
        <p className="fallback-description">
          The Host application is operating normally, but the requested remote component
          could not be loaded from port 3001.
        </p>
        <p className="fallback-details">
          <strong>Diagnostics:</strong> {reason}
        </p>
        {onRetry && (
          <div className="interactive-section">
            <button type="button" className="action-btn" onClick={onRetry}>
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteFallbackCard;
