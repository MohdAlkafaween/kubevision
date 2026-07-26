"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { TopologyNodeData } from "@/types/topology";
import { Sparkline, formatMetricValue } from "@/components/ui/sparkline";

const statusColors = {
  healthy: "border-neon-green/60 shadow-[0_0_8px_rgba(57,255,20,0.15)]",
  warning: "border-neon-amber/60 shadow-[0_0_8px_rgba(255,179,0,0.15)]",
  critical: "border-neon-red/60 shadow-[0_0_8px_rgba(255,23,68,0.15)]",
  unknown: "border-border",
};

const statusDotColors = {
  healthy: "bg-neon-green",
  warning: "bg-neon-amber",
  critical: "bg-neon-red",
  unknown: "bg-muted-foreground",
};

const kindIcons: Record<string, string> = {
  Node: "🖥",
  Pod: "▣",
  Deployment: "⬢",
  ReplicaSet: "⧉",
  StatefulSet: "▤",
  DaemonSet: "◈",
  Service: "◎",
  Ingress: "⇢",
  PersistentVolumeClaim: "▥",
  PersistentVolume: "▦",
  ConfigMap: "⚙",
  Secret: "🔒",
  Namespace: "▢",
  Job: "▶",
  CronJob: "◷",
};

const ELASTIC_COMPONENTS: Record<string, { badge: string; color: string }> = {
  elasticsearch: { badge: "ES", color: "bg-[#FEC514]/20 text-[#FEC514] border-[#FEC514]/40" },
  kibana: { badge: "KB", color: "bg-[#F04E98]/20 text-[#F04E98] border-[#F04E98]/40" },
  filebeat: { badge: "FB", color: "bg-[#00BFB3]/20 text-[#00BFB3] border-[#00BFB3]/40" },
  "fleet-server": { badge: "FS", color: "bg-[#00BFB3]/20 text-[#00BFB3] border-[#00BFB3]/40" },
  "apm-server": { badge: "APM", color: "bg-[#F04E98]/20 text-[#F04E98] border-[#F04E98]/40" },
  logstash: { badge: "LS", color: "bg-[#FEC514]/20 text-[#FEC514] border-[#FEC514]/40" },
  "elastic-operator": { badge: "ECK", color: "bg-[#FEC514]/20 text-[#FEC514] border-[#FEC514]/40" },
};

function detectNodeTailscaleIp(data: TopologyNodeData): string | null {
  if (data.kind !== "Node") return null;
  const raw = data.raw as Record<string, unknown> | null;
  if (!raw) return null;
  const status = (raw.status || {}) as Record<string, unknown>;
  const addresses = (status.addresses || []) as Array<{ type: string; address: string }>;
  for (const addr of addresses) {
    if (addr.address && addr.address.startsWith("100.")) return addr.address;
  }
  const annotations = data.annotations || {};
  const tsIp = annotations["tailscale.com/ip"] || annotations["tailscale.com/node-ip"];
  if (tsIp) return tsIp;
  return null;
}

const OPERATOR_BADGES: Record<string, { badge: string; color: string }> = {
  "cert-manager": { badge: "CM", color: "bg-[#00C7B7]/20 text-[#00C7B7] border-[#00C7B7]/40" },
  prometheus: { badge: "PROM", color: "bg-[#E6522C]/20 text-[#E6522C] border-[#E6522C]/40" },
  "ingress-nginx": { badge: "NGX", color: "bg-[#009639]/20 text-[#009639] border-[#009639]/40" },
};

function detectOperator(data: TopologyNodeData): { badge: string; color: string } | null {
  const labels = data.labels || {};
  const partOf = (labels["app.kubernetes.io/part-of"] || "").toLowerCase();
  const instance = (labels["app.kubernetes.io/instance"] || "").toLowerCase();
  const appName = (labels["app.kubernetes.io/name"] || labels["app"] || "").toLowerCase();
  const name = data.label.toLowerCase();

  for (const [key, val] of Object.entries(OPERATOR_BADGES)) {
    if (partOf.includes(key) || instance.includes(key) || appName.includes(key) || name.includes(key)) {
      return val;
    }
  }
  return null;
}

function detectHelmRelease(data: TopologyNodeData): string | null {
  const labels = data.labels || {};
  if (labels["app.kubernetes.io/managed-by"]?.toLowerCase() === "helm") {
    return labels["app.kubernetes.io/instance"] || "helm";
  }
  return null;
}

function detectTailscale(data: TopologyNodeData): boolean {
  const name = data.label.toLowerCase();
  const labels = data.labels || {};
  const appName = (labels["app.kubernetes.io/name"] || labels["app"] || "").toLowerCase();
  return name.includes("tailscale") || appName.includes("tailscale");
}

function detectElasticComponent(data: TopologyNodeData): { badge: string; color: string } | null {
  const name = data.label.toLowerCase();
  const labels = data.labels || {};
  const appName = (labels["app.kubernetes.io/name"] || labels["app"] || "").toLowerCase();
  const ns = (data.namespace || "").toLowerCase();

  for (const [key, val] of Object.entries(ELASTIC_COMPONENTS)) {
    if (appName.includes(key) || name.includes(key)) return val;
  }
  if (ns === "elastic-system") {
    return ELASTIC_COMPONENTS["elastic-operator"];
  }
  return null;
}

interface BaseNodeProps {
  data: TopologyNodeData;
  selected?: boolean;
}

export function BaseNode({ data, selected }: BaseNodeProps) {
  const icon = kindIcons[data.kind] || "?";
  const elastic = detectElasticComponent(data);
  const isTailscale = detectTailscale(data);
  const helmRelease = detectHelmRelease(data);
  const operatorBadge = detectOperator(data);

  return (
    <div
      className={cn(
        "px-3 py-2 rounded border bg-card min-w-[140px] max-w-[200px] transition-all duration-200",
        statusColors[data.status],
        selected && "ring-1 ring-neon-cyan border-neon-cyan"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-neon-cyan !border-none !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {data.kind}
        </span>
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full ml-auto",
            statusDotColors[data.status],
            data.status === "healthy" && "animate-pulse"
          )}
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
        {elastic && (
          <span className={cn("text-[7px] font-bold px-1 py-0 rounded border leading-tight", elastic.color)}>
            {elastic.badge}
          </span>
        )}
        {operatorBadge && !elastic && (
          <span className={cn("text-[7px] font-bold px-1 py-0 rounded border leading-tight", operatorBadge.color)}>
            {operatorBadge.badge}
          </span>
        )}
        {helmRelease && (
          <span className="text-[7px] font-bold px-1 py-0 rounded border leading-tight bg-[#0F1689]/30 text-[#3B82F6] border-[#3B82F6]/40" title={`Helm: ${helmRelease}`}>
            H
          </span>
        )}
        {isTailscale && (
          <span className="text-[7px] font-bold px-1 py-0 rounded border leading-tight bg-[#7C4DFF]/20 text-[#7C4DFF] border-[#7C4DFF]/40">
            TS
          </span>
        )}
      </div>

      {data.namespace && (
        <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
          ns: {data.namespace}
        </div>
      )}

      {data.info.phase && (
        <div className="text-[9px] text-muted-foreground mt-0.5">
          {data.info.phase}
          {data.info.restarts && data.info.restarts !== "0" && (
            <span className="text-neon-amber ml-1">({data.info.restarts} restarts)</span>
          )}
        </div>
      )}

      {data.kind === "Node" && detectNodeTailscaleIp(data) && (
        <div className="text-[8px] text-[#7C4DFF] mt-0.5 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-[#7C4DFF] animate-pulse" />
          TS: {detectNodeTailscaleIp(data)}
        </div>
      )}

      {data.sparkline && data.sparkline.cpu.length >= 2 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[7px] text-muted-foreground">CPU</span>
              <span className="text-[7px] text-neon-cyan font-mono">
                {formatMetricValue(data.sparkline.latestCpu, "cpu")}
              </span>
            </div>
            <Sparkline data={data.sparkline.cpu} width={55} height={14} color="#00e5ff" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[7px] text-muted-foreground">MEM</span>
              <span className="text-[7px] text-neon-purple font-mono">
                {formatMetricValue(data.sparkline.latestMemory, "memory")}
              </span>
            </div>
            <Sparkline data={data.sparkline.memory} width={55} height={14} color="#b388ff" />
          </div>
        </div>
      )}

      {data.metrics?.requestsPerSec !== undefined && data.metrics.requestsPerSec > 0 && (
        <div className="text-[9px] text-neon-cyan mt-1">
          {data.metrics.requestsPerSec.toFixed(1)} req/s
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-neon-cyan !border-none !w-1.5 !h-1.5" />
    </div>
  );
}
