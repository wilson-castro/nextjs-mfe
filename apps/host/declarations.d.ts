declare module 'remote/ServerCard' {
  import React from 'react';
  
  export interface ServerPayload {
    readonly origin: string;
    readonly timestamp: string;
    readonly serverNodeVersion: string;
    readonly requestId: string;
    readonly metrics: {
      readonly cpuArch: string;
      readonly platform: string;
      readonly memoryUsageMb: number;
    };
  }

  export interface ServerCardProps {
    readonly initialData?: ServerPayload;
    readonly title?: string;
  }

  const ServerCard: React.FC<ServerCardProps>;
  export default ServerCard;
}

declare module 'remote/getServerData' {
  export interface ServerPayload {
    readonly origin: string;
    readonly timestamp: string;
    readonly serverNodeVersion: string;
    readonly requestId: string;
    readonly metrics: {
      readonly cpuArch: string;
      readonly platform: string;
      readonly memoryUsageMb: number;
    };
  }

  export function getServerData(): Promise<ServerPayload>;
}
