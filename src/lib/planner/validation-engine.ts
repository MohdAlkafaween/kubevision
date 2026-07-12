import type { Node, Edge } from "@xyflow/react";
import type { PlanNodeData } from "@/components/planner/plan-node";
import type { PlanEdgeData } from "@/components/planner/plan-edge";

export type ValidationSeverity = "error" | "warning";

export interface QuickFix {
  label: string;
  action: "add-node" | "add-edge" | "set-field";
  payload: Record<string, unknown>;
}

export interface ValidationError {
  nodeId: string;
  severity: ValidationSeverity;
  rule: string;
  message: string;
  quickFix?: QuickFix;
}

const WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Pod",
  "Job",
  "CronJob",
]);

const CLUSTER_SCOPED_KINDS = new Set(["Node", "PersistentVolume"]);

function getTargets(
  nodeId: string,
  edges: Edge<PlanEdgeData>[]
): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

function getSources(
  nodeId: string,
  edges: Edge<PlanEdgeData>[]
): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

function nodeById(
  id: string,
  nodes: Node<PlanNodeData>[]
): Node<PlanNodeData> | undefined {
  return nodes.find((n) => n.id === id);
}

function validateNetworking(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    const d = node.data;

    if (d.kind === "Ingress" || d.kind === "LoadBalancer") {
      const targets = getTargets(node.id, edges);
      const hasServiceTarget = targets.some((tid) => {
        const t = nodeById(tid, nodes);
        return t && (t.data.kind === "Service" || t.data.kind === "LoadBalancer");
      });

      if (!hasServiceTarget) {
        errors.push({
          nodeId: node.id,
          severity: "error",
          rule: "networking-no-backend",
          message: `${d.kind} "${d.label}" has no backend Service connected`,
          quickFix: {
            label: "Add a Service",
            action: "add-node",
            payload: {
              kind: "Service",
              label: `${d.label}-svc`,
              icon: "🌐",
              namespace: d.namespace,
              sourceNodeId: node.id,
            },
          },
        });
      }
    }

    if (d.kind === "Service") {
      const targets = getTargets(node.id, edges);
      const sources = getSources(node.id, edges);
      const allConnected = [...targets, ...sources];
      const hasWorkload = allConnected.some((cid) => {
        const c = nodeById(cid, nodes);
        return c && WORKLOAD_KINDS.has(c.data.kind);
      });

      if (!hasWorkload) {
        errors.push({
          nodeId: node.id,
          severity: "warning",
          rule: "service-no-workload",
          message: `Service "${d.label}" has no matching Deployment or Pod`,
          quickFix: {
            label: "Add a Deployment",
            action: "add-node",
            payload: {
              kind: "Deployment",
              label: `${d.label}-deploy`,
              icon: "🚀",
              namespace: d.namespace,
              targetNodeId: node.id,
            },
          },
        });
      }
    }
  }

  return errors;
}

function validateStorage(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  const pvcs = nodes.filter((n) => n.data.kind === "PersistentVolumeClaim" || n.data.kind === "PVC");
  const pvs = nodes.filter((n) => n.data.kind === "PersistentVolume" || n.data.kind === "PV");

  for (const pvc of pvcs) {
    const connected = [
      ...getTargets(pvc.id, edges),
      ...getSources(pvc.id, edges),
    ];
    const hasPv = connected.some((cid) => {
      const c = nodeById(cid, nodes);
      return c && (c.data.kind === "PersistentVolume" || c.data.kind === "PV");
    });
    const hasStorageClass = !!(pvc.data.config.storageClassName || pvc.data.config.storageClass);

    if (!hasPv && !hasStorageClass) {
      errors.push({
        nodeId: pvc.id,
        severity: "warning",
        rule: "pvc-no-pv",
        message: `PVC "${pvc.data.label}" has no PV bound and no StorageClass specified`,
        quickFix: {
          label: "Add a PersistentVolume",
          action: "add-node",
          payload: {
            kind: "PersistentVolume",
            label: `${pvc.data.label}-pv`,
            icon: "🗄️",
            namespace: "",
            targetNodeId: pvc.id,
          },
        },
      });
    }
  }

  for (const node of nodes) {
    if (!WORKLOAD_KINDS.has(node.data.kind)) continue;
    const targets = getTargets(node.id, edges);
    for (const tid of targets) {
      const t = nodeById(tid, nodes);
      if (t && (t.data.kind === "PersistentVolumeClaim" || t.data.kind === "PVC")) {
        // workload -> PVC edge exists, this is fine
      }
    }

    const volumes = node.data.config.volumes as Array<Record<string, unknown>> | undefined;
    if (volumes && Array.isArray(volumes)) {
      for (const vol of volumes) {
        const claimName = (vol.persistentVolumeClaim as Record<string, unknown>)?.claimName as string;
        if (claimName) {
          const pvcExists = pvcs.some((p) => p.data.label === claimName);
          if (!pvcExists) {
            errors.push({
              nodeId: node.id,
              severity: "warning",
              rule: "workload-missing-pvc",
              message: `${node.data.kind} "${node.data.label}" references PVC "${claimName}" which doesn't exist on canvas`,
            });
          }
        }
      }
    }
  }

  return errors;
}

function validateScope(
  nodes: Node<PlanNodeData>[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    const d = node.data;

    if (CLUSTER_SCOPED_KINDS.has(d.kind) && d.namespace && d.namespace !== "default" && d.namespace !== "") {
      errors.push({
        nodeId: node.id,
        severity: "error",
        rule: "cluster-scoped-in-namespace",
        message: `${d.kind} "${d.label}" is cluster-scoped but assigned to namespace "${d.namespace}"`,
        quickFix: {
          label: "Clear namespace",
          action: "set-field",
          payload: { namespace: "" },
        },
      });
    }

    if (d.kind === "HelmChart") {
      const ns = (d.config.namespace as string) || d.namespace;
      if (!ns || ns === "default") {
        errors.push({
          nodeId: node.id,
          severity: "warning",
          rule: "helm-no-namespace",
          message: `Helm chart "${d.label}" should be assigned to a dedicated namespace`,
        });
      }
    }
  }

  return errors;
}

function validateConfig(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    const d = node.data;

    if (d.kind === "Deployment" || d.kind === "StatefulSet") {
      const replicas = d.replicas ?? (d.config.replicas as number);
      if (replicas === 0) {
        const sources = getSources(node.id, edges);
        const hasLb = sources.some((sid) => {
          const s = nodeById(sid, nodes);
          return s && (s.data.kind === "LoadBalancer" || s.data.kind === "Service" || s.data.kind === "Ingress");
        });

        if (hasLb) {
          errors.push({
            nodeId: node.id,
            severity: "error",
            rule: "zero-replicas-with-lb",
            message: `${d.kind} "${d.label}" has 0 replicas but is targeted by a Service/LoadBalancer`,
            quickFix: {
              label: "Set replicas to 1",
              action: "set-field",
              payload: { replicas: 1 },
            },
          });
        }
      }
    }
  }

  return errors;
}

export function validateTopology(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): ValidationError[] {
  if (nodes.length === 0) return [];

  return [
    ...validateNetworking(nodes, edges),
    ...validateStorage(nodes, edges),
    ...validateScope(nodes),
    ...validateConfig(nodes, edges),
  ];
}

export function groupErrorsByNode(
  errors: ValidationError[]
): Map<string, ValidationError[]> {
  const map = new Map<string, ValidationError[]>();
  for (const err of errors) {
    const list = map.get(err.nodeId) || [];
    list.push(err);
    map.set(err.nodeId, list);
  }
  return map;
}
