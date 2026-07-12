"use client";

import { useState, useEffect, useCallback } from "react";
import { Camera, Trash2, GitCompare, Plus, Minus, RefreshCw, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface SnapshotMeta {
  id: string;
  label: string;
  resourceCount: number;
  createdAt: string;
}

interface DiffEntry {
  kind: string;
  name: string;
  namespace: string;
  change: "added" | "removed" | "modified";
  details?: string[];
}

interface DiffResult {
  base: SnapshotMeta;
  compare: SnapshotMeta;
  diffs: DiffEntry[];
  summary: { added: number; removed: number; modified: number };
}

interface SnapshotDiffProps {
  cluster: string | null;
}

const changeColors = {
  added: { bg: "bg-neon-green/10", text: "text-neon-green", border: "border-neon-green/30", icon: Plus },
  removed: { bg: "bg-neon-red/10", text: "text-neon-red", border: "border-neon-red/30", icon: Minus },
  modified: { bg: "bg-neon-amber/10", text: "text-neon-amber", border: "border-neon-amber/30", icon: RefreshCw },
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SnapshotDiff({ cluster }: SnapshotDiffProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [filterKind, setFilterKind] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      setSnapshots(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [cluster]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const saveSnapshot = async () => {
    if (!cluster) return;
    setSaving(true);
    try {
      await fetch(`/api/snapshots/${encodeURIComponent(cluster)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || `Snapshot ${snapshots.length + 1}` }),
      });
      setLabel("");
      fetchSnapshots();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const deleteSnapshot = async (id: string) => {
    if (!cluster) return;
    await fetch(`/api/snapshots/${encodeURIComponent(cluster)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (baseId === id) setBaseId(null);
    if (compareId === id) setCompareId(null);
    setDiffResult(null);
    fetchSnapshots();
  };

  const runDiff = async () => {
    if (!baseId || !compareId) return;
    setDiffLoading(true);
    try {
      const res = await fetch("/api/snapshots/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseId, compareId }),
      });
      const data = await res.json();
      setDiffResult(data);
      setFilterKind(null);
    } catch {
      // ignore
    }
    setDiffLoading(false);
  };

  const filteredDiffs = diffResult
    ? filterKind
      ? diffResult.diffs.filter((d) => d.kind === filterKind)
      : diffResult.diffs
    : [];

  const diffKinds = diffResult
    ? [...new Set(diffResult.diffs.map((d) => d.kind))].sort()
    : [];

  if (!cluster) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a cluster to manage snapshots
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Camera className="w-4 h-4 text-neon-cyan" />
        <span className="text-sm font-medium text-neon-cyan">Snapshots</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {snapshots.length}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Snapshot label..."
            className="h-7 w-40 text-xs bg-card border-border"
          />
          <button
            onClick={saveSnapshot}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded border border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10 transition-colors disabled:opacity-50"
          >
            <Camera className="w-3 h-3" />
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Snapshot List */}
        <div className="w-[280px] border-r border-border flex flex-col">
          <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border">
            Select two snapshots to compare
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">Loading...</div>
            ) : snapshots.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                No snapshots yet. Save one to get started.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {snapshots.map((snap) => {
                  const isBase = baseId === snap.id;
                  const isCompare = compareId === snap.id;
                  return (
                    <div
                      key={snap.id}
                      className={`px-3 py-2.5 transition-colors ${
                        isBase || isCompare ? "bg-neon-cyan/5" : "hover:bg-accent/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground flex-1 truncate">
                          {snap.label || "Untitled"}
                        </span>
                        <button
                          onClick={() => deleteSnapshot(snap.id)}
                          className="text-muted-foreground hover:text-neon-red transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-muted-foreground">
                          {formatTime(snap.createdAt)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {snap.resourceCount} resources
                        </span>
                      </div>
                      <div className="flex gap-1.5 mt-1.5">
                        <button
                          onClick={() => setBaseId(isBase ? null : snap.id)}
                          className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                            isBase
                              ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Base
                        </button>
                        <button
                          onClick={() => setCompareId(isCompare ? null : snap.id)}
                          className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                            isCompare
                              ? "bg-neon-purple/10 border-neon-purple/50 text-neon-purple"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Compare
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          {baseId && compareId && (
            <div className="p-3 border-t border-border">
              <button
                onClick={runDiff}
                disabled={diffLoading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded bg-neon-cyan/10 border border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
              >
                <GitCompare className="w-3.5 h-3.5" />
                {diffLoading ? "Comparing..." : "Compare Snapshots"}
              </button>
            </div>
          )}
        </div>

        {/* Diff Results */}
        <div className="flex-1 flex flex-col min-w-0">
          {!diffResult ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <GitCompare className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select two snapshots and compare</p>
                <p className="text-xs mt-1 text-muted-foreground/60">
                  See what changed between two points in time
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Diff summary */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Base:</span>
                  <span className="text-neon-cyan">{diffResult.base.label || "Untitled"}</span>
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Compare:</span>
                  <span className="text-neon-purple">{diffResult.compare.label || "Untitled"}</span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {diffResult.summary.added > 0 && (
                    <span className="text-[10px] text-neon-green">+{diffResult.summary.added} added</span>
                  )}
                  {diffResult.summary.removed > 0 && (
                    <span className="text-[10px] text-neon-red">-{diffResult.summary.removed} removed</span>
                  )}
                  {diffResult.summary.modified > 0 && (
                    <span className="text-[10px] text-neon-amber">~{diffResult.summary.modified} modified</span>
                  )}
                  {diffResult.diffs.length === 0 && (
                    <span className="text-[10px] text-neon-green">No changes</span>
                  )}
                </div>
              </div>

              {/* Kind filter */}
              {diffKinds.length > 0 && (
                <div className="px-4 py-2 border-b border-border/50 flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterKind(null)}
                    className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                      !filterKind
                        ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({diffResult.diffs.length})
                  </button>
                  {diffKinds.map((k) => {
                    const count = diffResult.diffs.filter((d) => d.kind === k).length;
                    return (
                      <button
                        key={k}
                        onClick={() => setFilterKind(k === filterKind ? null : k)}
                        className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                          filterKind === k
                            ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {k} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Diff entries */}
              <ScrollArea className="flex-1">
                {filteredDiffs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    No changes to show
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 p-2">
                    {filteredDiffs.map((diff, i) => {
                      const cfg = changeColors[diff.change];
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className={`flex items-start gap-2.5 px-3 py-2 rounded ${cfg.bg}`}>
                          <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${cfg.text}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[8px] px-1 py-0 h-4 ${cfg.border} ${cfg.text}`}>
                                {diff.kind}
                              </Badge>
                              <span className="text-xs font-medium text-foreground truncate">{diff.name}</span>
                              {diff.namespace && (
                                <span className="text-[9px] text-muted-foreground">{diff.namespace}</span>
                              )}
                              <Badge variant="outline" className={`ml-auto text-[8px] px-1.5 py-0 h-4 ${cfg.border} ${cfg.text}`}>
                                {diff.change}
                              </Badge>
                            </div>
                            {diff.details && diff.details.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {diff.details.map((d, j) => (
                                  <div key={j} className="text-[10px] text-muted-foreground font-mono">
                                    {d}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
