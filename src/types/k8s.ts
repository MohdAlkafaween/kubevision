export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
}

export interface ClusterHealth {
  name: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  nodesReady: number;
  nodesTotal: number;
  podsRunning: number;
  podsTotal: number;
  podsFailed: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  namespaceCount: number;
  prometheusUrl?: string;
}

export type K8sResourceKind =
  | "Node"
  | "Pod"
  | "Deployment"
  | "ReplicaSet"
  | "StatefulSet"
  | "DaemonSet"
  | "Service"
  | "Ingress"
  | "ConfigMap"
  | "Secret"
  | "PersistentVolume"
  | "PersistentVolumeClaim"
  | "NetworkPolicy"
  | "Namespace"
  | "Job"
  | "CronJob";

export interface K8sResource {
  kind: K8sResourceKind;
  name: string;
  namespace?: string;
  uid: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string;
  status: ResourceStatus;
  raw: unknown;
}

export interface ResourceStatus {
  phase: string;
  ready: boolean;
  restartCount?: number;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  containerStatuses?: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    state: string;
    image: string;
  }>;
}

export interface K8sEvent {
  type: "ADDED" | "MODIFIED" | "DELETED";
  resource: K8sResource;
  timestamp: string;
}

export interface ClusterResources {
  nodes: K8sResource[];
  pods: K8sResource[];
  deployments: K8sResource[];
  replicaSets: K8sResource[];
  statefulSets: K8sResource[];
  daemonSets: K8sResource[];
  services: K8sResource[];
  ingresses: K8sResource[];
  configMaps: K8sResource[];
  secrets: K8sResource[];
  pvs: K8sResource[];
  pvcs: K8sResource[];
  networkPolicies: K8sResource[];
  namespaces: K8sResource[];
  jobs: K8sResource[];
  cronJobs: K8sResource[];
}

export interface PodMetrics {
  name: string;
  namespace: string;
  cpuUsage: string;
  memoryUsage: string;
}

export interface NodeMetrics {
  name: string;
  cpuUsage: string;
  cpuCapacity: string;
  memoryUsage: string;
  memoryCapacity: string;
}

export interface CommandSuggestion {
  label: string;
  command: string;
  description: string;
  severity: "info" | "warning" | "danger";
}
