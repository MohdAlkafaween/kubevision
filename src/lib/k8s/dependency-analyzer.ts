import type { K8sResource } from "@/types/k8s";

export interface DependencyNode {
  id: string;
  kind: string;
  name: string;
  namespace?: string;
  relation: string;
  exists: boolean;
}

export interface DependencyEdge {
  source: string;
  target: string;
  label: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export function analyzeDependencies(resource: K8sResource): DependencyGraph {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${resource.kind}/${resource.name}`;

  nodes.push({
    id: rootId,
    kind: resource.kind,
    name: resource.name,
    namespace: resource.namespace ?? undefined,
    relation: "self",
    exists: true,
  });

  const raw = resource.raw as Record<string, unknown> | null;
  if (!raw) return { nodes, edges };

  const spec = (raw.spec || {}) as Record<string, unknown>;

  if (resource.kind === "Pod") {
    analyzePodSpec(spec, rootId, resource.namespace ?? undefined, nodes, edges);
  } else if (resource.kind === "Deployment" || resource.kind === "StatefulSet" || resource.kind === "DaemonSet" || resource.kind === "Job") {
    const template = (spec.template || {}) as Record<string, unknown>;
    const podSpec = (template.spec || {}) as Record<string, unknown>;
    analyzePodSpec(podSpec, rootId, resource.namespace ?? undefined, nodes, edges);

    if (resource.kind === "Deployment" || resource.kind === "StatefulSet") {
      const selector = (spec.selector || {}) as Record<string, unknown>;
      const matchLabels = (selector.matchLabels || {}) as Record<string, string>;
      if (Object.keys(matchLabels).length > 0) {
        const selectorStr = Object.entries(matchLabels).map(([k, v]) => `${k}=${v}`).join(",");
        const svcId = `selector:${selectorStr}`;
        nodes.push({ id: svcId, kind: "Service", name: `(matching: ${selectorStr.substring(0, 30)})`, namespace: resource.namespace ?? undefined, relation: "selected-by", exists: true });
        edges.push({ source: svcId, target: rootId, label: "selects" });
      }
    }
  } else if (resource.kind === "Service") {
    const selector = (spec.selector || {}) as Record<string, string>;
    if (selector && Object.keys(selector).length > 0) {
      const selectorStr = Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(",");
      const podId = `pods:${selectorStr}`;
      nodes.push({ id: podId, kind: "Pod", name: `(selector: ${selectorStr.substring(0, 30)})`, namespace: resource.namespace ?? undefined, relation: "target", exists: true });
      edges.push({ source: rootId, target: podId, label: "routes to" });
    }
  } else if (resource.kind === "CronJob") {
    const jobTemplate = (spec.jobTemplate || {}) as Record<string, unknown>;
    const jobSpec = (jobTemplate.spec || {}) as Record<string, unknown>;
    const template = (jobSpec.template || {}) as Record<string, unknown>;
    const podSpec = (template.spec || {}) as Record<string, unknown>;
    analyzePodSpec(podSpec, rootId, resource.namespace ?? undefined, nodes, edges);
  }

  return { nodes, edges };
}

function analyzePodSpec(
  spec: Record<string, unknown>,
  rootId: string,
  namespace: string | undefined,
  nodes: DependencyNode[],
  edges: DependencyEdge[]
) {
  const volumes = (spec.volumes || []) as Array<Record<string, unknown>>;
  for (const vol of volumes) {
    if (vol.configMap) {
      const cm = vol.configMap as Record<string, unknown>;
      const name = cm.name as string;
      const id = `ConfigMap/${name}`;
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, kind: "ConfigMap", name, namespace, relation: "volume", exists: true });
        edges.push({ source: rootId, target: id, label: "mounts" });
      }
    }
    if (vol.secret) {
      const sec = vol.secret as Record<string, unknown>;
      const name = sec.secretName as string;
      const id = `Secret/${name}`;
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, kind: "Secret", name, namespace, relation: "volume", exists: true });
        edges.push({ source: rootId, target: id, label: "mounts" });
      }
    }
    if (vol.persistentVolumeClaim) {
      const pvc = vol.persistentVolumeClaim as Record<string, unknown>;
      const name = pvc.claimName as string;
      const id = `PVC/${name}`;
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, kind: "PVC", name, namespace, relation: "volume", exists: true });
        edges.push({ source: rootId, target: id, label: "claims" });
      }
    }
    if (vol.projected) {
      const projected = vol.projected as Record<string, unknown>;
      const sources = (projected.sources || []) as Array<Record<string, unknown>>;
      for (const src of sources) {
        if (src.configMap) {
          const name = (src.configMap as Record<string, unknown>).name as string;
          const id = `ConfigMap/${name}`;
          if (!nodes.find((n) => n.id === id)) {
            nodes.push({ id, kind: "ConfigMap", name, namespace, relation: "projected", exists: true });
            edges.push({ source: rootId, target: id, label: "projects" });
          }
        }
        if (src.secret) {
          const name = (src.secret as Record<string, unknown>).name as string;
          const id = `Secret/${name}`;
          if (!nodes.find((n) => n.id === id)) {
            nodes.push({ id, kind: "Secret", name, namespace, relation: "projected", exists: true });
            edges.push({ source: rootId, target: id, label: "projects" });
          }
        }
      }
    }
  }

  const containers = [
    ...((spec.containers || []) as Array<Record<string, unknown>>),
    ...((spec.initContainers || []) as Array<Record<string, unknown>>),
  ];
  for (const container of containers) {
    const env = (container.env || []) as Array<Record<string, unknown>>;
    for (const e of env) {
      const valueFrom = e.valueFrom as Record<string, unknown> | undefined;
      if (!valueFrom) continue;
      if (valueFrom.configMapKeyRef) {
        const ref = valueFrom.configMapKeyRef as Record<string, unknown>;
        const name = ref.name as string;
        const id = `ConfigMap/${name}`;
        if (!nodes.find((n) => n.id === id)) {
          nodes.push({ id, kind: "ConfigMap", name, namespace, relation: "env-ref", exists: true });
          edges.push({ source: rootId, target: id, label: "env ref" });
        }
      }
      if (valueFrom.secretKeyRef) {
        const ref = valueFrom.secretKeyRef as Record<string, unknown>;
        const name = ref.name as string;
        const id = `Secret/${name}`;
        if (!nodes.find((n) => n.id === id)) {
          nodes.push({ id, kind: "Secret", name, namespace, relation: "env-ref", exists: true });
          edges.push({ source: rootId, target: id, label: "env ref" });
        }
      }
    }
    const envFrom = (container.envFrom || []) as Array<Record<string, unknown>>;
    for (const ef of envFrom) {
      if (ef.configMapRef) {
        const name = (ef.configMapRef as Record<string, unknown>).name as string;
        const id = `ConfigMap/${name}`;
        if (!nodes.find((n) => n.id === id)) {
          nodes.push({ id, kind: "ConfigMap", name, namespace, relation: "envFrom", exists: true });
          edges.push({ source: rootId, target: id, label: "envFrom" });
        }
      }
      if (ef.secretRef) {
        const name = (ef.secretRef as Record<string, unknown>).name as string;
        const id = `Secret/${name}`;
        if (!nodes.find((n) => n.id === id)) {
          nodes.push({ id, kind: "Secret", name, namespace, relation: "envFrom", exists: true });
          edges.push({ source: rootId, target: id, label: "envFrom" });
        }
      }
    }
  }

  const saName = spec.serviceAccountName as string | undefined;
  if (saName && saName !== "default") {
    const id = `ServiceAccount/${saName}`;
    nodes.push({ id, kind: "ServiceAccount", name: saName, namespace, relation: "identity", exists: true });
    edges.push({ source: rootId, target: id, label: "runs as" });
  }
}
