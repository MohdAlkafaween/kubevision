import type { ClusterResources, K8sResource } from "@/types/k8s";
import type { TopologyNode, TopologyEdge, TopologyNodeData } from "@/types/topology";
import { mapRelationships } from "./mapper";

const NAMESPACE_COLORS: Record<string, string> = {
  default: "#00E5FF",
  "kube-system": "#FFB300",
  "kube-public": "#7C4DFF",
  monitoring: "#39FF14",
  "ingress-nginx": "#FF6E40",
  "elastic-system": "#FEC514",
};

let colorIndex = 0;
const EXTRA_COLORS = ["#E040FB", "#00BFA5", "#FF5252", "#448AFF", "#EEFF41"];

function getNamespaceColor(ns: string): string {
  if (NAMESPACE_COLORS[ns]) return NAMESPACE_COLORS[ns];
  const color = EXTRA_COLORS[colorIndex % EXTRA_COLORS.length];
  NAMESPACE_COLORS[ns] = color;
  colorIndex++;
  return color;
}

function resourceToStatus(r: K8sResource): TopologyNodeData["status"] {
  if (r.status.ready) return "healthy";
  if (r.status.phase === "Pending" || r.status.phase === "Progressing") return "warning";
  if (
    r.status.phase === "Failed" ||
    r.status.phase === "CrashLoopBackOff" ||
    r.status.phase === "NotReady"
  )
    return "critical";
  return "unknown";
}

function buildInfo(r: K8sResource): Record<string, string> {
  const info: Record<string, string> = {
    phase: r.status.phase,
    created: r.creationTimestamp,
  };
  if (r.namespace) info.namespace = r.namespace;
  if (r.status.restartCount !== undefined) info.restarts = String(r.status.restartCount);
  if (r.status.containerStatuses) {
    info.containers = r.status.containerStatuses
      .map((c) => `${c.name}:${c.state}`)
      .join(", ");
  }
  return info;
}

function makeNode(r: K8sResource, position = { x: 0, y: 0 }): TopologyNode {
  return {
    id: r.uid,
    type: `k8s-${r.kind.toLowerCase()}`,
    position,
    data: {
      label: r.name,
      kind: r.kind,
      status: resourceToStatus(r),
      namespace: r.namespace,
      uid: r.uid,
      info: buildInfo(r),
      labels: r.labels,
      annotations: r.annotations,
      raw: r.raw,
    },
  };
}

export function buildTopologyGraph(
  resources: ClusterResources,
  namespaceFilter?: string[]
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  const nodes: TopologyNode[] = [];

  const allResources = [
    ...resources.nodes,
    ...resources.pods,
    ...resources.deployments,
    ...resources.statefulSets,
    ...resources.daemonSets,
    ...resources.services,
    ...resources.ingresses,
    ...resources.pvcs,
    ...resources.pvs,
  ];

  const filtered = namespaceFilter && namespaceFilter.length > 0
    ? allResources.filter(
        (r) => !r.namespace || namespaceFilter.includes(r.namespace) || r.kind === "Node" || r.kind === "PersistentVolume"
      )
    : allResources;

  const seenIds = new Set<string>();
  for (const r of filtered) {
    if (seenIds.has(r.uid)) continue;
    seenIds.add(r.uid);
    const node = makeNode(r);
    node.style = {
      borderColor: r.namespace ? getNamespaceColor(r.namespace) : "#555",
    };
    nodes.push(node);
  }

  const relations = mapRelationships(resources);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: TopologyEdge[] = relations
    .filter((r) => nodeIds.has(r.sourceUid) && nodeIds.has(r.targetUid))
    .map((r, i) => ({
      id: `${r.sourceUid}-${r.targetUid}-${r.type}-${i}`,
      source: r.sourceUid,
      target: r.targetUid,
      type: r.type === "service" ? "traffic" : "default",
      animated: r.type === "service",
      data: {
        animated: r.type === "service",
        connectionType: r.type,
      },
      style: {
        stroke:
          r.type === "service"
            ? "#00E5FF"
            : r.type === "ingress"
            ? "#39FF14"
            : r.type === "storage"
            ? "#FFB300"
            : r.type === "network"
            ? "#7C4DFF"
            : "#555",
        strokeWidth: r.type === "service" ? 2 : r.type === "network" ? 2 : 1,
        strokeDasharray: r.type === "network" ? "6 3" : undefined,
        opacity: 0.7,
      },
    }));

  return { nodes, edges };
}
