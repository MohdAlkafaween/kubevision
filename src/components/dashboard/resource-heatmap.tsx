"use client";

import { useMemo } from "react";
import type { ClusterResources, K8sResource } from "@/types/k8s";
import { Badge } from "@/components/ui/badge";

interface ResourceHeatmapProps {
  resources: ClusterResources | null;
  onSelect?: (resource: K8sResource) => void;
}

export function ResourceHeatmap({ resources, onSelect }: ResourceHeatmapProps) {
  if (!resources) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a cluster to view heatmap
      </div>
    );
  }

  const nodeGroups = useMemo(() => {
    const groups: Record<string, { nodeName: string; pods: typeof resources.pods }> = {};

    for (const node of resources.nodes) {
      groups[node.name] = { nodeName: node.name, pods: [] };
    }

    for (const pod of resources.pods) {
      const raw = pod.raw as Record<string, unknown>;
      const spec = (raw.spec || {}) as Record<string, unknown>;
      const nodeName = (spec.nodeName as string) || "unscheduled";

      if (!groups[nodeName]) {
        groups[nodeName] = { nodeName, pods: [] };
      }
      groups[nodeName].pods.push(pod);
    }

    return Object.values(groups);
  }, [resources]);

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium">Resource Heatmap</span>
        <div className="flex items-center gap-2 ml-auto text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-neon-green/60" /> Healthy
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-neon-amber/60" /> Warning
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-neon-red/60" /> Critical
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {nodeGroups.map((group) => {
          const healthyPods = group.pods.filter((p) => p.status.ready).length;
          const totalPods = group.pods.length;
          const pct = totalPods > 0 ? healthyPods / totalPods : 1;
          const nodeStatus = pct === 1 ? "healthy" : pct >= 0.5 ? "warning" : "critical";

          return (
            <div
              key={group.nodeName}
              className={`border rounded-lg p-3 ${
                nodeStatus === "healthy"
                  ? "border-neon-green/20"
                  : nodeStatus === "warning"
                  ? "border-neon-amber/20"
                  : "border-neon-red/20"
              } bg-card`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    nodeStatus === "healthy"
                      ? "bg-neon-green"
                      : nodeStatus === "warning"
                      ? "bg-neon-amber"
                      : "bg-neon-red"
                  }`}
                />
                <span
                  className="text-xs font-medium cursor-pointer hover:text-neon-cyan transition-colors"
                  onClick={() => {
                    const node = resources.nodes.find((n) => n.name === group.nodeName);
                    if (node) onSelect?.(node);
                  }}
                >
                  {group.nodeName}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
                  {healthyPods}/{totalPods} pods
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {group.pods.map((pod) => {
                  const isHealthy = pod.status.ready;
                  const hasRestarts = (pod.status.restartCount || 0) > 3;
                  const isPending = pod.status.phase === "Pending";

                  return (
                    <div
                      key={pod.uid}
                      title={`${pod.name}\n${pod.status.phase}${hasRestarts ? ` (${pod.status.restartCount} restarts)` : ""}`}
                      onClick={() => onSelect?.(pod)}
                      className={`w-6 h-6 rounded flex items-center justify-center text-[7px] cursor-pointer transition-all hover:scale-125 ${
                        isHealthy
                          ? "bg-neon-green/20 text-neon-green border border-neon-green/30"
                          : isPending
                          ? "bg-neon-amber/20 text-neon-amber border border-neon-amber/30"
                          : "bg-neon-red/20 text-neon-red border border-neon-red/30"
                      } ${hasRestarts ? "animate-pulse" : ""}`}
                    >
                      {pod.name.slice(-3)}
                    </div>
                  );
                })}
                {group.pods.length === 0 && (
                  <span className="text-[10px] text-muted-foreground italic">No pods</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
