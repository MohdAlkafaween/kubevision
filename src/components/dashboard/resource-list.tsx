"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Search,
  Server,
  Box,
  Globe,
  Layers,
  HardDrive,
  Shield,
  Clock,
  Settings,
  Lock,
  Network as NetworkIcon,
  ArrowUpDown,
} from "lucide-react";
import { Sparkline, formatMetricValue } from "@/components/ui/sparkline";
import type { ClusterResources, K8sResource } from "@/types/k8s";
import type { MetricsHistory } from "@/hooks/use-metrics";

interface ResourceListProps {
  resources: ClusterResources | null;
  resourceType: string;
  onSelect: (resource: K8sResource) => void;
  metricsHistory?: MetricsHistory;
}

const RESOURCE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    getItems: (r: ClusterResources) => K8sResource[];
    columns: { key: string; label: string; extract: (r: K8sResource) => string }[];
  }
> = {
  nodes: {
    label: "Nodes",
    icon: <Server className="w-4 h-4" />,
    getItems: (r) => r.nodes,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      {
        key: "roles",
        label: "Roles",
        extract: (r) =>
          Object.keys(r.labels)
            .filter((l) => l.startsWith("node-role.kubernetes.io/"))
            .map((l) => l.replace("node-role.kubernetes.io/", ""))
            .join(", ") || "worker",
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  pods: {
    label: "Pods",
    icon: <Box className="w-4 h-4" />,
    getItems: (r) => r.pods,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      {
        key: "restarts",
        label: "Restarts",
        extract: (r) => String(r.status.restartCount ?? 0),
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  services: {
    label: "Services",
    icon: <Globe className="w-4 h-4" />,
    getItems: (r) => r.services,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "type",
        label: "Type",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          return (spec.type as string) || "ClusterIP";
        },
      },
      {
        key: "ports",
        label: "Ports",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          const ports = (spec.ports || []) as Array<{ port: number; targetPort: number | string }>;
          return ports.map((p) => `${p.port}→${p.targetPort}`).join(", ");
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  deployments: {
    label: "Deployments",
    icon: <Layers className="w-4 h-4" />,
    getItems: (r) => r.deployments,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "replicas",
        label: "Ready",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          return `${status.readyReplicas ?? 0}/${status.replicas ?? 0}`;
        },
      },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  network: {
    label: "Ingresses",
    icon: <NetworkIcon className="w-4 h-4" />,
    getItems: (r) => r.ingresses,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "hosts",
        label: "Hosts",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          const rules = (spec.rules || []) as Array<{ host?: string }>;
          return rules.map((rule) => rule.host || "*").join(", ");
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  statefulsets: {
    label: "StatefulSets",
    icon: <Layers className="w-4 h-4" />,
    getItems: (r) => r.statefulSets,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "replicas",
        label: "Ready",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          return `${status.readyReplicas ?? 0}/${status.replicas ?? 0}`;
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  daemonsets: {
    label: "DaemonSets",
    icon: <Server className="w-4 h-4" />,
    getItems: (r) => r.daemonSets,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "desired",
        label: "Desired",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          return String(status.desiredNumberScheduled ?? 0);
        },
      },
      {
        key: "ready",
        label: "Ready",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          return String(status.numberReady ?? 0);
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  jobs: {
    label: "Jobs",
    icon: <Clock className="w-4 h-4" />,
    getItems: (r) => r.jobs,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      {
        key: "completions",
        label: "Completions",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          return `${status.succeeded ?? 0}/${spec.completions ?? 1}`;
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  cronjobs: {
    label: "CronJobs",
    icon: <Clock className="w-4 h-4" />,
    getItems: (r) => r.cronJobs,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "schedule",
        label: "Schedule",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          return (spec.schedule as string) || "—";
        },
      },
      {
        key: "suspended",
        label: "Suspended",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          return spec.suspend ? "Yes" : "No";
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  pvcs: {
    label: "Persistent Volume Claims",
    icon: <HardDrive className="w-4 h-4" />,
    getItems: (r) => r.pvcs,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      {
        key: "capacity",
        label: "Capacity",
        extract: (r) => {
          const status = ((r.raw as Record<string, unknown>).status || {}) as Record<string, unknown>;
          const cap = (status.capacity || {}) as Record<string, string>;
          return cap.storage || "—";
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  pvs: {
    label: "Persistent Volumes",
    icon: <HardDrive className="w-4 h-4" />,
    getItems: (r) => r.pvs,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      {
        key: "capacity",
        label: "Capacity",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          const cap = (spec.capacity || {}) as Record<string, string>;
          return cap.storage || "—";
        },
      },
      {
        key: "reclaimPolicy",
        label: "Reclaim",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          return (spec.persistentVolumeReclaimPolicy as string) || "—";
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  configmaps: {
    label: "ConfigMaps",
    icon: <Settings className="w-4 h-4" />,
    getItems: (r) => r.configMaps,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "keys",
        label: "Data Keys",
        extract: (r) => {
          const data = ((r.raw as Record<string, unknown>).data || {}) as Record<string, unknown>;
          return String(Object.keys(data).length);
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  secrets: {
    label: "Secrets",
    icon: <Lock className="w-4 h-4" />,
    getItems: (r) => r.secrets,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "type",
        label: "Type",
        extract: (r) => {
          return ((r.raw as Record<string, unknown>).type as string) || "Opaque";
        },
      },
      {
        key: "keys",
        label: "Data Keys",
        extract: (r) => {
          const data = ((r.raw as Record<string, unknown>).data || {}) as Record<string, unknown>;
          return String(Object.keys(data).length);
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  namespaces: {
    label: "Namespaces",
    icon: <Shield className="w-4 h-4" />,
    getItems: (r) => r.namespaces,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "status", label: "Status", extract: (r) => r.status.phase },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
  networkpolicies: {
    label: "Network Policies",
    icon: <Shield className="w-4 h-4" />,
    getItems: (r) => r.networkPolicies,
    columns: [
      { key: "name", label: "Name", extract: (r) => r.name },
      { key: "namespace", label: "Namespace", extract: (r) => r.namespace || "—" },
      {
        key: "podSelector",
        label: "Pod Selector",
        extract: (r) => {
          const spec = ((r.raw as Record<string, unknown>).spec || {}) as Record<string, unknown>;
          const sel = (spec.podSelector || {}) as Record<string, unknown>;
          const labels = (sel.matchLabels || {}) as Record<string, string>;
          const entries = Object.entries(labels);
          return entries.length > 0 ? entries.map(([k, v]) => `${k}=${v}`).join(", ") : "All pods";
        },
      },
      { key: "age", label: "Age", extract: (r) => getAge(r.creationTimestamp) },
    ],
  },
};

function getAge(timestamp: string): string {
  if (!timestamp) return "—";
  const diff = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(diff / 60000);
  return `${mins}m`;
}

const METRICS_RESOURCE_TYPES = new Set(["pods", "nodes"]);

export function ResourceList({ resources, resourceType, onSelect, metricsHistory }: ResourceListProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const config = RESOURCE_CONFIG[resourceType];
  const items = config ? (resources ? config.getItems(resources) : []) : [];
  const showMetrics = METRICS_RESOURCE_TYPES.has(resourceType) && !!metricsHistory;

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.namespace?.toLowerCase().includes(q) ||
          r.status.phase.toLowerCase().includes(q)
      );
    }
    if (sortKey && config) {
      const col = config.columns.find((c) => c.key === sortKey);
      if (col) {
        result = [...result].sort((a, b) => {
          const va = col.extract(a);
          const vb = col.extract(b);
          return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }
    }
    return result;
  }, [items, search, sortKey, sortAsc, config]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Unknown resource type
      </div>
    );
  }

  if (!resources) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a cluster to view {config.label.toLowerCase()}
      </div>
    );
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-neon-cyan">
          {config.icon}
          <span className="text-sm font-medium">{config.label}</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {filtered.length}
        </Badge>
        <div className="ml-auto relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="h-7 w-48 pl-7 text-xs bg-card border-border"
          />
        </div>
      </div>

      <div className="grid border-b border-border bg-[var(--terminal-header)]" style={{
        gridTemplateColumns: config.columns.map(() => "1fr").join(" ") + (showMetrics ? " 120px 120px" : ""),
      }}>
        {config.columns.map((col) => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors text-left"
          >
            {col.label}
            {sortKey === col.key && (
              <ArrowUpDown className="w-2.5 h-2.5 text-neon-cyan" />
            )}
          </button>
        ))}
        {showMetrics && (
          <>
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">CPU</div>
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">Memory</div>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
            {search ? "No matching resources" : `No ${config.label.toLowerCase()} found`}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((resource) => (
              <button
                key={resource.uid}
                onClick={() => onSelect(resource)}
                className="w-full grid hover:bg-accent/50 transition-colors text-left"
                style={{
                  gridTemplateColumns: config.columns.map(() => "1fr").join(" ") + (showMetrics ? " 120px 120px" : ""),
                }}
              >
                {config.columns.map((col) => {
                  const value = col.extract(resource);
                  const isStatus = col.key === "status";
                  const isRestarts = col.key === "restarts";
                  return (
                    <div
                      key={col.key}
                      className={`px-3 py-2 text-xs truncate ${
                        isStatus
                          ? resource.status.ready
                            ? "text-neon-green"
                            : resource.status.phase === "Pending"
                            ? "text-neon-amber"
                            : "text-neon-red"
                          : isRestarts && parseInt(value) > 3
                          ? "text-neon-amber"
                          : "text-foreground/80"
                      }`}
                    >
                      {isStatus && (
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                            resource.status.ready
                              ? "bg-neon-green"
                              : resource.status.phase === "Pending"
                              ? "bg-neon-amber"
                              : "bg-neon-red"
                          }`}
                        />
                      )}
                      {value}
                    </div>
                  );
                })}
                {showMetrics && (() => {
                  const key = resourceType === "pods"
                    ? `${resource.namespace}/${resource.name}`
                    : resource.name;
                  const entry = resourceType === "pods"
                    ? metricsHistory!.pods.get(key)
                    : metricsHistory!.nodes.get(key);
                  return (
                    <>
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        {entry && entry.cpu.length >= 2 ? (
                          <>
                            <Sparkline data={entry.cpu} width={50} height={16} color="#00e5ff" />
                            <span className="text-[9px] text-neon-cyan font-mono whitespace-nowrap">
                              {formatMetricValue(entry.cpu[entry.cpu.length - 1], "cpu")}
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/50">—</span>
                        )}
                      </div>
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        {entry && entry.memory.length >= 2 ? (
                          <>
                            <Sparkline data={entry.memory} width={50} height={16} color="#b388ff" />
                            <span className="text-[9px] text-neon-purple font-mono whitespace-nowrap">
                              {formatMetricValue(entry.memory[entry.memory.length - 1], "memory")}
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/50">—</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
