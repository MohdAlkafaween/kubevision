import type { Node, Edge } from "@xyflow/react";

export interface TopologyNodeData {
  label: string;
  kind: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  namespace?: string;
  uid: string;
  info: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  metrics?: {
    cpu?: string;
    memory?: string;
    requestsPerSec?: number;
    errorRate?: number;
  };
  sparkline?: {
    cpu: number[];
    memory: number[];
    latestCpu: number;
    latestMemory: number;
  };
  raw: unknown;
  [key: string]: unknown;
}

export type TopologyNode = Node<TopologyNodeData>;
export type TopologyEdge = Edge<{
  traffic?: {
    requestsPerSec: number;
    latencyP95: number;
    errorRate: number;
  };
  animated: boolean;
  connectionType: "service" | "ingress" | "storage" | "owner" | "network";
}>;

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
