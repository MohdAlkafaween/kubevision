"use client";

import { type DragEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface PaletteItem {
  kind: string;
  label: string;
  icon: string;
  category: "compute" | "networking" | "storage" | "config" | "workload" | "helm";
  defaultConfig: Record<string, unknown>;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    kind: "Cluster",
    label: "Cluster",
    icon: "⎈",
    category: "compute",
    defaultConfig: { name: "my-cluster" },
  },
  {
    kind: "Node",
    label: "Node",
    icon: "🖥️",
    category: "compute",
    defaultConfig: { cpu: "4", memory: "8Gi", roles: ["worker"] },
  },
  {
    kind: "Pod",
    label: "Pod",
    icon: "📦",
    category: "compute",
    defaultConfig: { containers: [{ name: "app", image: "nginx:latest", ports: [{ containerPort: 80 }] }] },
  },
  {
    kind: "Deployment",
    label: "Deployment",
    icon: "🚀",
    category: "workload",
    defaultConfig: { replicas: 3, strategy: "RollingUpdate" },
  },
  {
    kind: "StatefulSet",
    label: "StatefulSet",
    icon: "📊",
    category: "workload",
    defaultConfig: { replicas: 3, serviceName: "my-statefulset" },
  },
  {
    kind: "DaemonSet",
    label: "DaemonSet",
    icon: "👹",
    category: "workload",
    defaultConfig: {},
  },
  {
    kind: "Job",
    label: "Job",
    icon: "⚡",
    category: "workload",
    defaultConfig: { completions: 1, parallelism: 1 },
  },
  {
    kind: "CronJob",
    label: "CronJob",
    icon: "🕐",
    category: "workload",
    defaultConfig: { schedule: "*/5 * * * *" },
  },
  {
    kind: "Service",
    label: "Service",
    icon: "🌐",
    category: "networking",
    defaultConfig: { type: "ClusterIP", ports: [{ port: 80, targetPort: 8080 }] },
  },
  {
    kind: "Ingress",
    label: "Ingress",
    icon: "🚪",
    category: "networking",
    defaultConfig: { rules: [{ host: "example.com", paths: [{ path: "/", pathType: "Prefix" }] }] },
  },
  {
    kind: "NetworkPolicy",
    label: "NetworkPolicy",
    icon: "🛡️",
    category: "networking",
    defaultConfig: { podSelector: {}, policyTypes: ["Ingress", "Egress"] },
  },
  {
    kind: "LoadBalancer",
    label: "LoadBalancer",
    icon: "⚖️",
    category: "networking",
    defaultConfig: { type: "LoadBalancer", ports: [{ port: 80, targetPort: 8080 }] },
  },
  {
    kind: "PersistentVolumeClaim",
    label: "PVC",
    icon: "💾",
    category: "storage",
    defaultConfig: { accessModes: ["ReadWriteOnce"], storage: "10Gi" },
  },
  {
    kind: "PersistentVolume",
    label: "PV",
    icon: "🗄️",
    category: "storage",
    defaultConfig: { capacity: "100Gi", accessModes: ["ReadWriteOnce"] },
  },
  {
    kind: "ConfigMap",
    label: "ConfigMap",
    icon: "📋",
    category: "config",
    defaultConfig: { data: {} },
  },
  {
    kind: "Secret",
    label: "Secret",
    icon: "🔑",
    category: "config",
    defaultConfig: { type: "Opaque", data: {} },
  },
  {
    kind: "Namespace",
    label: "Namespace",
    icon: "📁",
    category: "config",
    defaultConfig: {},
  },
  {
    kind: "HPA",
    label: "HPA",
    icon: "📈",
    category: "workload",
    defaultConfig: { minReplicas: 1, maxReplicas: 10, targetCPU: 50 },
  },
  {
    kind: "HelmChart",
    label: "NGINX Ingress",
    icon: "⎈",
    category: "helm",
    defaultConfig: {
      helmChart: true,
      repoName: "ingress-nginx",
      repoUrl: "https://kubernetes.github.io/ingress-nginx",
      chart: "ingress-nginx",
      releaseName: "ingress-nginx",
      namespace: "ingress-nginx",
      values: { "controller.replicaCount": "2" },
    },
  },
  {
    kind: "HelmChart",
    label: "Prometheus Stack",
    icon: "⎈",
    category: "helm",
    defaultConfig: {
      helmChart: true,
      repoName: "prometheus-community",
      repoUrl: "https://prometheus-community.github.io/helm-charts",
      chart: "kube-prometheus-stack",
      releaseName: "monitoring",
      namespace: "monitoring",
      values: { "grafana.enabled": "true", "alertmanager.enabled": "true" },
    },
  },
  {
    kind: "HelmChart",
    label: "Cert-Manager",
    icon: "⎈",
    category: "helm",
    defaultConfig: {
      helmChart: true,
      repoName: "jetstack",
      repoUrl: "https://charts.jetstack.io",
      chart: "cert-manager",
      releaseName: "cert-manager",
      namespace: "cert-manager",
      values: { "installCRDs": "true" },
    },
  },
  {
    kind: "HelmChart",
    label: "Elastic Stack (ECK)",
    icon: "⎈",
    category: "helm",
    defaultConfig: {
      helmChart: true,
      repoName: "elastic",
      repoUrl: "https://helm.elastic.co",
      chart: "eck-operator",
      releaseName: "elastic-operator",
      namespace: "elastic-system",
      values: {},
    },
  },
];

const CATEGORIES = [
  { id: "compute", label: "Compute" },
  { id: "workload", label: "Workloads" },
  { id: "networking", label: "Networking" },
  { id: "storage", label: "Storage" },
  { id: "config", label: "Config" },
  { id: "helm", label: "Helm Charts" },
];

export function ResourcePalette() {
  const onDragStart = (e: DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/kubevision-resource", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-48 flex-shrink-0 bg-[var(--terminal-bg)] border-r border-border flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] text-neon-cyan uppercase tracking-widest font-semibold">
          Resource Palette
        </span>
        <p className="text-[9px] text-muted-foreground mt-0.5">Drag to canvas</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {CATEGORIES.map((cat) => {
            const items = PALETTE_ITEMS.filter((i) => i.category === cat.id);
            if (items.length === 0) return null;

            return (
              <div key={cat.id}>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                  {cat.label}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <div
                      key={`${item.kind}-${item.label}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border hover:bg-accent/30 cursor-grab active:cursor-grabbing transition-colors group"
                    >
                      <span className="text-sm">{item.icon}</span>
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export { PALETTE_ITEMS };
