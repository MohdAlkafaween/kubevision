import type { Node, Edge } from "@xyflow/react";
import type { PlanNodeData } from "@/components/planner/plan-node";
import type { PlanEdgeData } from "@/components/planner/plan-edge";

export type InstallPhase =
  | "namespace"
  | "config"
  | "operator"
  | "helm"
  | "workload"
  | "networking"
  | "storage"
  | "verification";

export interface PlaybookStep {
  phase: InstallPhase;
  order: number;
  nodeId: string;
  kind: string;
  label: string;
  namespace: string;
  config: Record<string, unknown>;
  icon: string;
  dependsOn: string[];
}

const PHASE_PRIORITY: Record<InstallPhase, number> = {
  namespace: 0,
  config: 1,
  operator: 2,
  helm: 3,
  storage: 4,
  workload: 5,
  networking: 6,
  verification: 7,
};

const KIND_TO_PHASE: Record<string, InstallPhase> = {
  Namespace: "namespace",
  ConfigMap: "config",
  Secret: "config",
  PersistentVolume: "storage",
  PersistentVolumeClaim: "storage",
  PV: "storage",
  PVC: "storage",
  Deployment: "workload",
  StatefulSet: "workload",
  DaemonSet: "workload",
  Pod: "workload",
  Job: "workload",
  CronJob: "workload",
  HPA: "workload",
  Service: "networking",
  Ingress: "networking",
  NetworkPolicy: "networking",
  LoadBalancer: "networking",
  Node: "workload",
  HelmChart: "helm",
};

function isOperatorKind(kind: string, config: Record<string, unknown>): boolean {
  const operatorKinds = [
    "Elasticsearch",
    "Kibana",
    "Prometheus",
    "Alertmanager",
    "ServiceMonitor",
    "Certificate",
    "Issuer",
    "ClusterIssuer",
  ];
  if (operatorKinds.includes(kind)) return true;
  if (config.helmChart && isOperatorChart(config)) return true;
  return false;
}

function isOperatorChart(config: Record<string, unknown>): boolean {
  const chart = (config.chart as string) || "";
  return /cert-manager|prometheus|elastic|eck-operator/i.test(chart);
}

function classifyPhase(kind: string, config: Record<string, unknown>): InstallPhase {
  if (kind === "HelmChart" && isOperatorChart(config)) return "operator";
  if (isOperatorKind(kind, config)) return "operator";
  return KIND_TO_PHASE[kind] || "workload";
}

export function buildPlaybookSteps(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): PlaybookStep[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const deps = adjacency.get(edge.target) || [];
    deps.push(edge.source);
    adjacency.set(edge.target, deps);
  }

  const steps: PlaybookStep[] = nodes.map((node) => {
    const d = node.data;
    const phase = classifyPhase(d.kind, d.config);
    const directDeps = adjacency.get(node.id) || [];

    return {
      phase,
      order: PHASE_PRIORITY[phase],
      nodeId: node.id,
      kind: d.kind,
      label: d.label,
      namespace: d.namespace || "default",
      config: d.config,
      icon: d.icon,
      dependsOn: directDeps,
    };
  });

  steps.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });

  return steps;
}

export function collectNamespaces(steps: PlaybookStep[]): string[] {
  const ns = new Set<string>();
  for (const step of steps) {
    if (step.namespace && step.namespace !== "default") {
      ns.add(step.namespace);
    }
    if (step.kind === "Namespace") {
      ns.add(step.label);
    }
  }
  return Array.from(ns).sort();
}

export function groupByPhase(steps: PlaybookStep[]): Map<InstallPhase, PlaybookStep[]> {
  const groups = new Map<InstallPhase, PlaybookStep[]>();
  for (const step of steps) {
    const list = groups.get(step.phase) || [];
    list.push(step);
    groups.set(step.phase, list);
  }
  return groups;
}
