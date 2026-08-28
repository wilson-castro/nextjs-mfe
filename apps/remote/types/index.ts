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
