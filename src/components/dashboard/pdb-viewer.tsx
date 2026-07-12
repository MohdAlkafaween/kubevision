"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";

interface Pdb {
  name: string;
  namespace: string;
  minAvailable?: number | string;
  maxUnavailable?: number | string;
  currentHealthy: number;
  desiredHealthy: number;
  disruptionsAllowed: number;
  expectedPods: number;
  matchLabels: Record<string, string>;
}

interface PdbViewerProps {
  cluster: string | null;
}

export function PdbViewer({ cluster }: PdbViewerProps) {
  const [pdbs, setPdbs] = useState<Pdb[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPdbs = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/pdb/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      setPdbs(data.pdbs || []);
    } catch {
      setPdbs([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchPdbs();
    const interval = setInterval(fetchPdbs, 15000);
    return () => clearInterval(interval);
  }, [fetchPdbs]);

  const isHealthy = (pdb: Pdb) => pdb.currentHealthy >= pdb.desiredHealthy;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-5 h-5 text-neon-cyan animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading PDBs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-medium">Pod Disruption Budgets</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{pdbs.length}</span>
        </div>
        <button onClick={fetchPdbs} className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {pdbs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground mb-1">No PDBs found</p>
            <p className="text-[10px] text-muted-foreground/60">Create PodDisruptionBudgets to protect workloads during disruptions</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {pdbs.map((pdb) => {
              const healthy = isHealthy(pdb);
              return (
                <div
                  key={`${pdb.namespace}/${pdb.name}`}
                  className="p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {healthy ? (
                        <CheckCircle className="w-3.5 h-3.5 text-neon-green" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-neon-amber" />
                      )}
                      <span className="text-xs font-medium">{pdb.name}</span>
                      <span className="text-[10px] text-muted-foreground">{pdb.namespace}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      healthy ? "bg-neon-green/10 text-neon-green" : "bg-neon-amber/10 text-neon-amber"
                    }`}>
                      {healthy ? "Healthy" : "Unhealthy"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Budget</p>
                      <p className="text-xs font-mono">
                        {pdb.minAvailable != null && `min: ${pdb.minAvailable}`}
                        {pdb.maxUnavailable != null && `maxUnavail: ${pdb.maxUnavailable}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Healthy</p>
                      <p className="text-xs font-mono">
                        <span className={healthy ? "text-neon-green" : "text-neon-amber"}>{pdb.currentHealthy}</span>
                        <span className="text-muted-foreground"> / {pdb.desiredHealthy}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Disruptions Allowed</p>
                      <p className="text-xs font-mono">{pdb.disruptionsAllowed}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Expected Pods</p>
                      <p className="text-xs font-mono">{pdb.expectedPods}</p>
                    </div>
                  </div>

                  {Object.keys(pdb.matchLabels).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(pdb.matchLabels).map(([k, v]) => (
                        <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                          {k}={v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
