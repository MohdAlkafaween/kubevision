"use client";

import { useState, useEffect, useCallback } from "react";
import { Scale, RefreshCw, Loader2, Server, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ClusterContext, ClusterResources } from "@/types/k8s";

interface ClusterSnapshot {
  context: ClusterContext;
  resources: ClusterResources | null;
  error: string | null;
  loading: boolean;
}

interface Stats {
  nodesReady: number;
  nodesTotal: number;
  podsRunning: number;
  podsTotal: number;
  deployments: number;
  services: number;
  namespaces: number;
  healthPercent: number;
}

function computeStats(resources: ClusterResources | null): Stats {
  if (!resources) {
    return {
      nodesReady: 0,
      nodesTotal: 0,
      podsRunning: 0,
      podsTotal: 0,
      deployments: 0,
      services: 0,
      namespaces: 0,
      healthPercent: 0,
    };
  }
  const nodesReady = resources.nodes.filter((n) => n.status.ready).length;
  const nodesTotal = resources.nodes.length;
  const podsRunning = resources.pods.filter((p) => p.status.ready).length;
  const podsTotal = resources.pods.length;

  const nodeHealth = nodesTotal > 0 ? nodesReady / nodesTotal : 1;
  const podHealth = podsTotal > 0 ? podsRunning / podsTotal : 1;
  const healthPercent = Math.round(((nodeHealth + podHealth) / 2) * 100);

  return {
    nodesReady,
    nodesTotal,
    podsRunning,
    podsTotal,
    deployments: resources.deployments.length,
    services: resources.services.length,
    namespaces: resources.namespaces.length,
    healthPercent,
  };
}

function StatRow({
  label,
  value,
  isOutlier,
  outlierBad,
}: {
  label: string;
  value: string;
  isOutlier: boolean;
  outlierBad: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span
        className={`text-[11px] font-mono tabular-nums ${
          isOutlier ? (outlierBad ? "text-neon-red font-semibold" : "text-neon-amber font-semibold") : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ClusterCompare() {
  const [snapshots, setSnapshots] = useState<ClusterSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clusters");
      const data = await res.json();
      const contexts: ClusterContext[] = data.contexts || [];

      setSnapshots(contexts.map((context) => ({ context, resources: null, error: null, loading: true })));

      const results = await Promise.all(
        contexts.map(async (context) => {
          try {
            const r = await fetch(`/api/resources/${encodeURIComponent(context.name)}`);
            const d = await r.json();
            if (d.error) {
              return { context, resources: null, error: d.error as string, loading: false };
            }
            return { context, resources: d as ClusterResources, error: null, loading: false };
          } catch {
            return { context, resources: null, error: "Failed to fetch", loading: false };
          }
        })
      );

      setSnapshots(results);
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const allStats = snapshots.map((s) => computeStats(s.resources));

  const isOutlier = (values: number[], idx: number): { outlier: boolean; bad: boolean } => {
    const valid = values.filter((v) => !Number.isNaN(v));
    if (valid.length < 2) return { outlier: false, bad: false };
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    if (max === min) return { outlier: false, bad: false };
    const v = values[idx];
    if (v === max) return { outlier: false, bad: false };
    if (v === min) return { outlier: true, bad: true };
    return { outlier: false, bad: false };
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[var(--terminal-header)]">
        <Scale className="w-3.5 h-3.5 text-neon-cyan" />
        <span className="text-[11px] text-foreground font-medium">Cluster Comparison</span>
        <span className="text-[10px] text-muted-foreground">
          {snapshots.length} {snapshots.length === 1 ? "cluster" : "clusters"}
        </span>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <ScrollArea className="flex-1">
        {loading && snapshots.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Scale className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-xs text-muted-foreground">No cluster contexts found</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {snapshots.map((snap, idx) => {
              const stats = allStats[idx];
              const healthOutlier = isOutlier(
                allStats.map((s) => s.healthPercent),
                idx
              );
              const nodesOutlier = isOutlier(
                allStats.map((s) => (s.nodesTotal > 0 ? s.nodesReady / s.nodesTotal : 1)),
                idx
              );
              const podsOutlier = isOutlier(
                allStats.map((s) => (s.podsTotal > 0 ? s.podsRunning / s.podsTotal : 1)),
                idx
              );

              return (
                <div
                  key={snap.context.name}
                  className="border border-border rounded-lg overflow-hidden bg-[var(--terminal-bg)]/50"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                    <Server className="w-3.5 h-3.5 text-neon-purple flex-shrink-0" />
                    <span className="text-[11px] text-foreground font-medium truncate flex-1">
                      {snap.context.name}
                    </span>
                    {snap.loading ? (
                      <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                    ) : snap.error ? (
                      <span className="flex items-center gap-1 text-[9px] text-neon-red">
                        <AlertTriangle className="w-3 h-3" />
                        Error
                      </span>
                    ) : (
                      <span
                        className={`flex items-center gap-1 text-[9px] ${
                          stats.healthPercent >= 90
                            ? "text-neon-green"
                            : stats.healthPercent >= 60
                            ? "text-neon-amber"
                            : "text-neon-red"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {stats.healthPercent}%
                      </span>
                    )}
                  </div>

                  <div className="p-3">
                    {snap.error ? (
                      <p className="text-[10px] text-neon-red">{snap.error}</p>
                    ) : (
                      <div className="divide-y divide-border/40">
                        <StatRow
                          label="Nodes"
                          value={`${stats.nodesReady}/${stats.nodesTotal}`}
                          isOutlier={nodesOutlier.outlier}
                          outlierBad={nodesOutlier.bad}
                        />
                        <StatRow
                          label="Pods"
                          value={`${stats.podsRunning}/${stats.podsTotal}`}
                          isOutlier={podsOutlier.outlier}
                          outlierBad={podsOutlier.bad}
                        />
                        <StatRow
                          label="Deployments"
                          value={String(stats.deployments)}
                          isOutlier={false}
                          outlierBad={false}
                        />
                        <StatRow
                          label="Services"
                          value={String(stats.services)}
                          isOutlier={false}
                          outlierBad={false}
                        />
                        <StatRow
                          label="Namespaces"
                          value={String(stats.namespaces)}
                          isOutlier={false}
                          outlierBad={false}
                        />
                        <StatRow
                          label="Health"
                          value={`${stats.healthPercent}%`}
                          isOutlier={healthOutlier.outlier}
                          outlierBad={healthOutlier.bad}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
