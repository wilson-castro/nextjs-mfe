declare module 'remote/ServerCard' {
  import React from 'react';
  
  export interface UserSession {
    readonly userId: string;
    readonly userName: string;
    readonly email: string;
    readonly role: 'admin' | 'operator' | 'viewer';
    readonly tenant: string;
  }

  export interface ServerPayload {
    readonly origin: string;
    readonly timestamp: string;
    readonly serverNodeVersion: string;
    readonly requestId: string;
    readonly session?: UserSession | null;
    readonly cached?: boolean;
    readonly metrics: {
      readonly cpuArch: string;
      readonly platform: string;
      readonly memoryUsageMb: number;
    };
  }

  export interface ServerCardProps {
    readonly initialData?: ServerPayload;
    readonly title?: string;
    readonly session?: UserSession;
  }

  const ServerCard: React.FC<ServerCardProps>;
  export default ServerCard;
}

declare module 'remote/RemoteTelemetry' {
  import React from 'react';
  import type { UserSession } from 'remote/ServerCard';

  export interface RemoteTelemetryProps {
    readonly filterLevel?: 'all' | 'info' | 'warn' | 'critical';
    readonly maxEvents?: number;
    readonly session?: UserSession;
  }

  const RemoteTelemetry: React.FC<RemoteTelemetryProps>;
  export default RemoteTelemetry;
}

declare module 'remote/RemoteMap' {
  import React from 'react';
  import type { UserSession } from 'remote/ServerCard';

  export interface MapMarker {
    readonly id: string;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
    readonly status: 'active' | 'warning' | 'idle';
    readonly description: string;
  }

  export interface RemoteMapProps {
    readonly selectedCity?: string;
    readonly lat?: number;
    readonly lng?: number;
    readonly zoom?: number;
    readonly onMarkerClick?: (marker: MapMarker) => void;
    readonly session?: UserSession;
  }

  const RemoteMap: React.FC<RemoteMapProps>;
  export default RemoteMap;
}

declare module 'remote/RemoteDashboard' {
  import React from 'react';
  import type { ServerPayload, UserSession } from 'remote/ServerCard';

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

  const RemoteDashboard: React.FC<RemoteDashboardProps>;
  export default RemoteDashboard;
}

declare module 'remote/getServerData' {
  import type { ServerPayload, UserSession } from 'remote/ServerCard';
  export function getServerData(session?: UserSession): Promise<ServerPayload>;
}

declare module 'remote/events' {
  import type { UserSession } from 'remote/ServerCard';
  export function emitToast(title: string, message: string, type?: 'info' | 'success' | 'warn' | 'error'): void;
  export function emitSessionChange(session: UserSession): void;
}
