"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, ArrowUpDown, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";

interface HpaMetric {
  type: string;
  name: string;
  targetType?: string;
  targetValue?: number | string;
  currentValue?: number | string;
}

interface HpaCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

interface Hpa {
  name: string;
  namespace: string;
  targetKind: string;
  targetName: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  desiredReplicas: number;
  metrics: HpaMetric[];
  conditions: HpaCondition[];
}

interface HpaViewerProps {
  cluster: string | null;
}

export function HpaViewer({ cluster }: HpaViewerProps) {
  const [hpas, setHpas] = useState<Hpa[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Hpa | null>(null);

  const fetchHpas = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/hpa/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      setHpas(data.hpas || []);
    } catch {
      setHpas([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchHpas();
    const interval = setInterval(fetchHpas, 10000);
    return () => clearInterval(interval);
  }, [fetchHpas]);

  const getScalePercent = (hpa: Hpa) => {
    if (hpa.maxReplicas === 0) return 0;
    return Math.round((hpa.currentReplicas / hpa.maxReplicas) * 100);
  };

  const isScaling = (hpa: Hpa) => hpa.currentReplicas !== hpa.desiredReplicas;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-5 h-5 text-neon-cyan animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading HPAs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-medium">Horizontal Pod Autoscalers</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{hpas.length}</span>
        </div>
        <button onClick={fetchHpas} className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {hpas.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground mb-1">No HPAs found</p>
            <p className="text-[10px] text-muted-foreground/60">Create an HPA to enable auto-scaling</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {hpas.map((hpa) => {
                const pct = getScalePercent(hpa);
                const scaling = isScaling(hpa);
                return (
                  <button
                    key={`${hpa.namespace}/${hpa.name}`}
                    onClick={() => setSelected(hpa)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selected?.name === hpa.name && selected?.namespace === hpa.namespace
                        ? "border-neon-cyan/50 bg-neon-cyan/5"
                        : "border-border bg-card hover:border-border/80 hover:bg-accent/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium truncate">{hpa.name}</span>
                      {scaling && (
                        <span className="flex items-center gap-1 text-[9px] text-neon-amber">
                          <ArrowUpDown className="w-3 h-3" />
                          Scaling
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      {hpa.namespace} / {hpa.targetKind}: {hpa.targetName}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct > 90 ? "bg-neon-red" : pct > 70 ? "bg-neon-amber" : "bg-neon-cyan"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        Replicas: <span className="text-foreground font-mono">{hpa.currentReplicas}</span>
                        {scaling && <span className="text-neon-amber"> → {hpa.desiredReplicas}</span>}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {hpa.minReplicas}–{hpa.maxReplicas}
                      </span>
                    </div>

                    {hpa.metrics.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                        {hpa.metrics.map((m, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{m.name || m.type}</span>
                            <span className="font-mono">
                              <span className="text-foreground">{m.currentValue ?? "?"}</span>
                              <span className="text-muted-foreground/60"> / {m.targetValue ?? "?"}</span>
                              {m.targetType === "Utilization" && <span className="text-muted-foreground/60">%</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="w-80 border-l border-border overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium">{selected.name}</span>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs">x</button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Target</p>
                  <p className="text-xs">{selected.targetKind}/{selected.targetName}</p>
                  <p className="text-[10px] text-muted-foreground">{selected.namespace}</p>
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Scale Range</p>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-lg font-mono text-foreground">{selected.minReplicas}</p>
                      <p className="text-[9px] text-muted-foreground">Min</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-lg font-mono text-neon-cyan">{selected.currentReplicas}</p>
                      <p className="text-[9px] text-muted-foreground">Current</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-lg font-mono text-foreground">{selected.maxReplicas}</p>
                      <p className="text-[9px] text-muted-foreground">Max</p>
                    </div>
                  </div>
                </div>

                {selected.metrics.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Metrics</p>
                    <div className="space-y-1.5">
                      {selected.metrics.map((m, i) => (
                        <div key={i} className="p-2 rounded bg-muted/30 border border-border/50">
                          <p className="text-[10px] font-medium">{m.name || m.type}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">Current</span>
                            <span className="text-xs font-mono text-foreground">{m.currentValue ?? "N/A"}{m.targetType === "Utilization" ? "%" : ""}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">Target</span>
                            <span className="text-xs font-mono text-muted-foreground">{m.targetValue ?? "N/A"}{m.targetType === "Utilization" ? "%" : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.conditions.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Conditions</p>
                    <div className="space-y-1">
                      {selected.conditions.map((c, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px]">
                          {c.status === "True" ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-neon-green mt-1 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-neon-amber mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <span className="font-medium">{c.type}</span>
                            <span className="text-muted-foreground"> — {c.reason}</span>
                            {c.message && <p className="text-muted-foreground/70 mt-0.5">{c.message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
