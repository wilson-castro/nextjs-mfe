export interface UserSession {
  readonly userId: string;
  readonly userName: string;
  readonly email: string;
  readonly role: 'admin' | 'operator' | 'viewer';
  readonly tenant: string;
}

export interface ServerMetrics {
  readonly cpuArch: string;
  readonly platform: string;
  readonly memoryUsageMb: number;
}

export interface ServerPayload {
  readonly origin: string;
  readonly timestamp: string;
  readonly serverNodeVersion: string;
  readonly requestId: string;
  readonly session?: UserSession | null;
  readonly metrics: ServerMetrics;
  readonly cached?: boolean;
}

export interface TelemetryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly level: 'info' | 'warn' | 'critical';
  readonly source: string;
  readonly message: string;
  readonly value: number;
}

export interface MapMarker {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly status: 'active' | 'warning' | 'idle';
  readonly description: string;
}

export interface ToastPayload {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly type: 'info' | 'success' | 'warning' | 'error';
  readonly timestamp: number;
}

export interface ServerCardProps {
  readonly initialData?: ServerPayload;
  readonly title?: string;
  readonly session?: UserSession;
}

export interface RemoteMapProps {
  readonly selectedCity?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly zoom?: number;
  readonly onMarkerClick?: (marker: MapMarker) => void;
  readonly session?: UserSession;
}

export interface RemoteTelemetryProps {
  readonly filterLevel?: 'all' | 'info' | 'warn' | 'critical';
  readonly maxEvents?: number;
  readonly session?: UserSession;
}

