'use client';

import React from 'react';
import type { ServerPayload, UserSession } from '../types';
import ServerCard from './ServerCard';
import RemoteTelemetry from './RemoteTelemetry';
import RemoteMap from './RemoteMap';

export interface RemoteDashboardProps {
  readonly activeTab?: 'overview' | 'telemetry' | 'map' | 'metrics';
  readonly serverData?: ServerPayload | null;
  readonly session?: UserSession;
  readonly queryParams?: {
    readonly filter?: 'all' | 'info' | 'warn' | 'critical';
    readonly city?: string;
    readonly lat?: number;
    readonly lng?: number;
  };
}

export const RemoteDashboard: React.FC<RemoteDashboardProps> = ({
  activeTab = 'overview',
  serverData,
  session,
  queryParams,
}) => {
  return (
    <div className="remote-dashboard-container">
      {activeTab === 'overview' && (
        <div className="tab-pane">
          <ServerCard initialData={serverData || undefined} session={session} />
        </div>
      )}

      {activeTab === 'telemetry' && (
        <div className="tab-pane">
          <RemoteTelemetry
            filterLevel={queryParams?.filter || 'all'}
            session={session}
          />
        </div>
      )}

      {activeTab === 'map' && (
        <div className="tab-pane">
          <RemoteMap
            lat={queryParams?.lat}
            lng={queryParams?.lng}
            selectedCity={queryParams?.city}
            session={session}
          />
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="tab-pane metrics-pane">
          <ServerCard initialData={serverData || undefined} session={session} title="Server Metrics & Caching Diagnostics" />
          <div style={{ marginTop: '1.5rem' }}>
            <RemoteTelemetry filterLevel="warn" session={session} maxEvents={5} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RemoteDashboard;
