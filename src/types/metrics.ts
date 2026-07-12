export interface PrometheusConfig {
  url: string;
  clusterId: string;
}

export interface PrometheusQueryResult {
  metric: Record<string, string>;
  value: [number, string];
}

export interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface ServiceTraffic {
  source: string;
  destination: string;
  requestsPerSec: number;
  latencyP95Ms: number;
  errorRate: number;
}

export interface ResourceMetrics {
  name: string;
  namespace?: string;
  cpuUsageCores: number;
  cpuRequestCores: number;
  cpuLimitCores: number;
  memoryUsageBytes: number;
  memoryRequestBytes: number;
  memoryLimitBytes: number;
  networkRxBytesPerSec: number;
  networkTxBytesPerSec: number;
}
