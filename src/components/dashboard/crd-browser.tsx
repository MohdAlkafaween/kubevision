"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Puzzle, Loader2, ChevronRight, RefreshCw, Copy, Check, Search, Layers } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CrdSummary {
  name: string;
  group: string;
  kind: string;
  plural: string;
  scope: string;
  versions: string[];
  age: string;
}

interface CrdInstanceSummary {
  name: string;
  namespace?: string;
  uid: string;
  creationTimestamp: string;
}

export function CrdBrowser({ cluster }: { cluster: string | null }) {
  const [crds, setCrds] = useState<CrdSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedCrd, setSelectedCrd] = useState<CrdSummary | null>(null);
  const [instances, setInstances] = useState<CrdInstanceSummary[]>([]);
  const [instanceItems, setInstanceItems] = useState<Record<string, unknown>[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState<string | null>(null);

  const [selectedInstanceUid, setSelectedInstanceUid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCrds = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crds/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setCrds([]);
      } else {
        setCrds(data.crds || []);
      }
    } catch {
      setError("Failed to load CRDs");
      setCrds([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchCrds();
  }, [fetchCrds]);

  const selectCrd = useCallback(
    async (crd: CrdSummary) => {
      if (!cluster) return;
      setSelectedCrd(crd);
      setSelectedInstanceUid(null);
      setInstances([]);
      setInstanceItems([]);
      setInstancesError(null);
      setInstancesLoading(true);
      try {
        const res = await fetch(
          `/api/crds/${encodeURIComponent(cluster)}?crd=${encodeURIComponent(crd.name)}`
        );
        const data = await res.json();
        if (data.error) {
          setInstancesError(data.error);
        } else {
          setInstances(data.instances || []);
          setInstanceItems(data.items || []);
        }
      } catch {
        setInstancesError("Failed to load instances");
      } finally {
        setInstancesLoading(false);
      }
    },
    [cluster]
  );

  const selectedInstanceRaw = useMemo(() => {
    if (!selectedInstanceUid) return null;
    const idx = instances.findIndex((i) => i.uid === selectedInstanceUid);
    if (idx === -1) return null;
    return instanceItems[idx] ?? null;
  }, [selectedInstanceUid, instances, instanceItems]);

  const selectedInstance = useMemo(
    () => instances.find((i) => i.uid === selectedInstanceUid) || null,
    [instances, selectedInstanceUid]
  );

  const yamlText = selectedInstanceRaw ? JSON.stringify(selectedInstanceRaw, null, 2) : "";

  const copyYaml = () => {
    navigator.clipboard.writeText(yamlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredCrds = crds.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.kind.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });

  if (!cluster) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a cluster to browse Custom Resource Definitions</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--terminal-bg)]">
      {/* Left panel: CRD list */}
      <div className="w-[320px] flex-shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
          <div className="flex items-center gap-1.5">
            <Puzzle className="w-3.5 h-3.5 text-neon-cyan" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              CRDs {crds.length > 0 && <span className="text-neon-cyan/70">({crds.length})</span>}
            </span>
          </div>
          <button
            onClick={fetchCrds}
            disabled={loading}
            className="text-muted-foreground hover:text-neon-cyan transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="px-2 py-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter CRDs..."
              className="w-full bg-[var(--terminal-bg)] text-[10px] text-foreground border border-border rounded pl-6 pr-2 py-1.5 focus:outline-none focus:border-neon-cyan font-mono"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading && crds.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px] text-neon-red">{error}</p>
            </div>
          ) : filteredCrds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Puzzle className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-xs text-muted-foreground">
                {crds.length === 0 ? "No CustomResourceDefinitions found" : "No CRDs match your filter"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredCrds.map((crd) => {
                const isActive = selectedCrd?.name === crd.name;
                return (
                  <button
                    key={crd.name}
                    onClick={() => selectCrd(crd)}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      isActive ? "bg-neon-cyan/8 border-r-2 border-neon-cyan" : "hover:bg-accent/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-medium truncate ${isActive ? "text-neon-cyan" : "text-foreground"}`}>
                        {crd.kind || crd.name}
                      </span>
                      <span className="ml-auto text-[8px] px-1 py-0 rounded border border-border text-muted-foreground shrink-0">
                        {crd.scope === "Cluster" ? "Cluster" : "NS"}
                      </span>
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate mt-0.5 font-mono">{crd.group}</div>
                    {crd.versions.length > 0 && (
                      <div className="text-[8px] text-muted-foreground/60 mt-0.5">
                        {crd.versions.join(", ")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel: instances + yaml */}
      <div className="flex-1 flex min-w-0 min-h-0">
        {!selectedCrd ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Layers className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-xs text-muted-foreground">Select a CRD to view its instances</p>
            </div>
          </div>
        ) : (
          <>
            {/* Instances list */}
            <div className="w-[300px] flex-shrink-0 border-r border-border flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                <div className="text-[11px] font-medium text-foreground truncate">{selectedCrd.kind}</div>
                <div className="text-[9px] text-muted-foreground font-mono truncate">{selectedCrd.name}</div>
              </div>
              <ScrollArea className="flex-1">
                {instancesLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
                  </div>
                ) : instancesError ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[11px] text-neon-red">{instancesError}</p>
                  </div>
                ) : instances.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-xs text-muted-foreground">No instances found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {instances.map((inst) => {
                      const isActive = selectedInstanceUid === inst.uid;
                      return (
                        <button
                          key={inst.uid}
                          onClick={() => setSelectedInstanceUid(inst.uid)}
                          className={`w-full flex items-center gap-1.5 text-left px-3 py-2 transition-colors ${
                            isActive ? "bg-neon-cyan/8 border-r-2 border-neon-cyan" : "hover:bg-accent/20"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className={`text-[11px] truncate ${isActive ? "text-neon-cyan" : "text-foreground"}`}>
                              {inst.name}
                            </div>
                            {inst.namespace && (
                              <div className="text-[9px] text-muted-foreground font-mono truncate">
                                {inst.namespace}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* YAML viewer */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {!selectedInstance ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Select an instance to view its YAML</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground truncate">{selectedInstance.name}</span>
                      {selectedInstance.namespace && (
                        <span className="text-[9px] text-muted-foreground font-mono ml-2">
                          {selectedInstance.namespace}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={copyYaml}
                      className="text-muted-foreground hover:text-neon-cyan text-[10px] flex items-center gap-1 shrink-0"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <ScrollArea className="flex-1">
                    <pre className="p-3 text-[10px] text-neon-green/80 leading-relaxed">{yamlText}</pre>
                  </ScrollArea>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
