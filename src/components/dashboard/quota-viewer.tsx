"use client";

import { useState, useEffect, useCallback } from "react";
import { Gauge, RefreshCw, AlertTriangle } from "lucide-react";

interface QuotaResource {
  name: string;
  hard: string;
  used: string;
}

interface ResourceQuota {
  type: "ResourceQuota";
  name: string;
  namespace: string;
  resources: QuotaResource[];
}

interface LimitRangeLimit {
  limitType: string;
  default?: Record<string, string>;
  defaultRequest?: Record<string, string>;
  max?: Record<string, string>;
  min?: Record<string, string>;
}

interface LimitRange {
  type: "LimitRange";
  name: string;
  namespace: string;
  limits: LimitRangeLimit[];
}

interface QuotaViewerProps {
  cluster: string | null;
}

export function QuotaViewer({ cluster }: QuotaViewerProps) {
  const [quotas, setQuotas] = useState<ResourceQuota[]>([]);
  const [limitRanges, setLimitRanges] = useState<LimitRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"quotas" | "limits">("quotas");

  const fetchData = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/quotas/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      setQuotas(data.quotas || []);
      setLimitRanges(data.limitRanges || []);
    } catch {
      setQuotas([]);
      setLimitRanges([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const parseValue = (val: string): number => {
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    if (val.endsWith("Gi")) return num * 1024;
    if (val.endsWith("Mi")) return num;
    if (val.endsWith("Ki")) return num / 1024;
    if (val.endsWith("m")) return num / 1000;
    return num;
  };

  const getUsagePercent = (used: string, hard: string): number => {
    const u = parseValue(used);
    const h = parseValue(hard);
    if (h === 0) return 0;
    return Math.min(100, Math.round((u / h) * 100));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-5 h-5 text-neon-cyan animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading quotas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-medium">Resource Quotas & Limits</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-border overflow-hidden">
            <button
              onClick={() => setTab("quotas")}
              className={`px-2.5 py-1 text-[10px] transition-colors ${
                tab === "quotas" ? "bg-neon-cyan/10 text-neon-cyan" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Quotas ({quotas.length})
            </button>
            <button
              onClick={() => setTab("limits")}
              className={`px-2.5 py-1 text-[10px] transition-colors ${
                tab === "limits" ? "bg-neon-cyan/10 text-neon-cyan" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Limit Ranges ({limitRanges.length})
            </button>
          </div>
          <button onClick={fetchData} className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {tab === "quotas" && (
        <div className="flex-1 overflow-auto p-4">
          {quotas.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">No ResourceQuotas found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {quotas.map((q) => (
                <div key={`${q.namespace}/${q.name}`} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium">{q.name}</span>
                    <span className="text-[10px] text-muted-foreground">{q.namespace}</span>
                  </div>
                  <div className="space-y-2">
                    {q.resources.map((r) => {
                      const pct = getUsagePercent(r.used, r.hard);
                      return (
                        <div key={r.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">{r.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono">
                                <span className="text-foreground">{r.used}</span>
                                <span className="text-muted-foreground/60"> / {r.hard}</span>
                              </span>
                              {pct > 90 && <AlertTriangle className="w-3 h-3 text-neon-red" />}
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct > 90 ? "bg-neon-red" : pct > 70 ? "bg-neon-amber" : "bg-neon-cyan"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "limits" && (
        <div className="flex-1 overflow-auto p-4">
          {limitRanges.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">No LimitRanges found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {limitRanges.map((lr) => (
                <div key={`${lr.namespace}/${lr.name}`} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium">{lr.name}</span>
                    <span className="text-[10px] text-muted-foreground">{lr.namespace}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/50">
                          <th className="text-left py-1 pr-3 font-normal">Type</th>
                          <th className="text-left py-1 pr-3 font-normal">Resource</th>
                          <th className="text-right py-1 pr-3 font-normal">Min</th>
                          <th className="text-right py-1 pr-3 font-normal">Max</th>
                          <th className="text-right py-1 pr-3 font-normal">Default</th>
                          <th className="text-right py-1 font-normal">Default Request</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lr.limits.map((l, i) => {
                          const allKeys = new Set([
                            ...Object.keys(l.default || {}),
                            ...Object.keys(l.defaultRequest || {}),
                            ...Object.keys(l.max || {}),
                            ...Object.keys(l.min || {}),
                          ]);
                          return Array.from(allKeys).map((resource) => (
                            <tr key={`${i}-${resource}`} className="border-b border-border/30">
                              <td className="py-1 pr-3 text-foreground">{l.limitType}</td>
                              <td className="py-1 pr-3 font-mono">{resource}</td>
                              <td className="py-1 pr-3 text-right font-mono">{l.min?.[resource] || "—"}</td>
                              <td className="py-1 pr-3 text-right font-mono">{l.max?.[resource] || "—"}</td>
                              <td className="py-1 pr-3 text-right font-mono">{l.default?.[resource] || "—"}</td>
                              <td className="py-1 text-right font-mono">{l.defaultRequest?.[resource] || "—"}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
