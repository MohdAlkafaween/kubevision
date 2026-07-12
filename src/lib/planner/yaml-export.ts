import type { Node, Edge } from "@xyflow/react";
import type { PlanNodeData } from "@/components/planner/plan-node";
import type { PlanEdgeData } from "@/components/planner/plan-edge";

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function toYamlValue(val: unknown, depth = 0): string {
  if (val === null || val === undefined) return '""';
  if (typeof val === "string") return val.includes(":") || val.includes("#") ? `"${val}"` : val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return val
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          const lines = objectToYaml(item as Record<string, unknown>, depth + 1);
          const firstLine = lines.split("\n")[0];
          const rest = lines.split("\n").slice(1).join("\n");
          return `- ${firstLine}${rest ? "\n" + rest : ""}`;
        }
        return `- ${toYamlValue(item, depth + 1)}`;
      })
      .join("\n");
  }
  if (typeof val === "object") {
    return "\n" + indent(objectToYaml(val as Record<string, unknown>, depth + 1), 2);
  }
  return String(val);
}

function objectToYaml(obj: Record<string, unknown>, depth = 0): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, val]) => {
      if (typeof val === "object" && !Array.isArray(val) && val !== null) {
        const inner = objectToYaml(val as Record<string, unknown>, depth + 1);
        return `${key}:\n${indent(inner, 2)}`;
      }
      if (Array.isArray(val)) {
        const items = toYamlValue(val, depth);
        return `${key}:\n${indent(items, 2)}`;
      }
      return `${key}: ${toYamlValue(val, depth)}`;
    })
    .join("\n");
}

function generateDeploymentYaml(data: PlanNodeData): string {
  const containers = (data.config.containers as Array<Record<string, unknown>>) || [
    { name: "app", image: "nginx:latest" },
  ];

  return objectToYaml({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: data.label,
      namespace: data.namespace || "default",
    },
    spec: {
      replicas: data.replicas || (data.config.replicas as number) || 1,
      selector: {
        matchLabels: { app: data.label },
      },
      template: {
        metadata: {
          labels: { app: data.label },
        },
        spec: { containers },
      },
    },
  });
}

function generateServiceYaml(data: PlanNodeData): string {
  return objectToYaml({
    apiVersion: "v1",
    kind: data.kind === "LoadBalancer" ? "Service" : "Service",
    metadata: {
      name: data.label,
      namespace: data.namespace || "default",
    },
    spec: {
      type: data.kind === "LoadBalancer" ? "LoadBalancer" : (data.config.type as string) || "ClusterIP",
      selector: { app: data.label },
      ports: (data.config.ports as unknown[]) || [{ port: 80, targetPort: 8080 }],
    },
  });
}

function generatePodYaml(data: PlanNodeData): string {
  const containers = (data.config.containers as Array<Record<string, unknown>>) || [
    { name: "app", image: "nginx:latest" },
  ];

  return objectToYaml({
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: data.label,
      namespace: data.namespace || "default",
      labels: { app: data.label },
    },
    spec: { containers },
  });
}

function generateIngressYaml(data: PlanNodeData): string {
  return objectToYaml({
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: data.label,
      namespace: data.namespace || "default",
    },
    spec: {
      rules: (data.config.rules as unknown[]) || [
        {
          host: "example.com",
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: { service: { name: data.label, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  });
}

function generateHelmYaml(data: PlanNodeData): string {
  const cfg = data.config;
  const lines: string[] = [
    `# Helm Chart: ${data.label}`,
    `# Release: ${cfg.releaseName || data.label}`,
    `# Namespace: ${cfg.namespace || "default"}`,
    "",
    `# Step 1: Add Helm repository`,
    `# helm repo add ${cfg.repoName} ${cfg.repoUrl}`,
    `# helm repo update`,
    "",
    `# Step 2: Install chart`,
    `# helm install ${cfg.releaseName || data.label} ${cfg.repoName}/${cfg.chart} \\`,
    `#   --namespace ${cfg.namespace || "default"} \\`,
    `#   --create-namespace \\`,
  ];

  const values = (cfg.values || {}) as Record<string, string>;
  for (const [k, v] of Object.entries(values)) {
    lines.push(`#   --set ${k}=${v} \\`);
  }

  if (lines[lines.length - 1].endsWith(" \\")) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -2);
  }

  return lines.join("\n");
}

function generateGenericYaml(data: PlanNodeData): string {
  const apiVersionMap: Record<string, string> = {
    ConfigMap: "v1",
    Secret: "v1",
    Namespace: "v1",
    PersistentVolumeClaim: "v1",
    PersistentVolume: "v1",
    NetworkPolicy: "networking.k8s.io/v1",
    StatefulSet: "apps/v1",
    DaemonSet: "apps/v1",
    Job: "batch/v1",
    CronJob: "batch/v1",
    HPA: "autoscaling/v2",
  };

  const manifest: Record<string, unknown> = {
    apiVersion: apiVersionMap[data.kind] || "v1",
    kind: data.kind === "HPA" ? "HorizontalPodAutoscaler" : data.kind,
    metadata: {
      name: data.label,
      ...(data.namespace && data.kind !== "Namespace" && data.kind !== "PersistentVolume"
        ? { namespace: data.namespace || "default" }
        : {}),
    },
  };

  if (Object.keys(data.config).length > 0) {
    manifest.spec = data.config;
  }

  return objectToYaml(manifest);
}

export function exportToYaml(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): string {
  const manifests = nodes.map((node) => {
    const data = node.data;

    let yaml: string;
    switch (data.kind) {
      case "HelmChart":
        yaml = generateHelmYaml(data);
        break;
      case "Deployment":
      case "StatefulSet":
      case "DaemonSet":
        yaml = generateDeploymentYaml(data);
        break;
      case "Service":
      case "LoadBalancer":
        yaml = generateServiceYaml(data);
        break;
      case "Pod":
        yaml = generatePodYaml(data);
        break;
      case "Ingress":
        yaml = generateIngressYaml(data);
        break;
      default:
        yaml = generateGenericYaml(data);
    }

    if (data.notes) {
      yaml = `# ${data.notes}\n${yaml}`;
    }

    return yaml;
  });

  return manifests.join("\n---\n");
}

export function exportPlanAsJson(
  nodes: Node<PlanNodeData>[],
  edges: Edge<PlanEdgeData>[]
): string {
  return JSON.stringify(
    {
      version: "1.0",
      createdAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
    },
    null,
    2
  );
}
