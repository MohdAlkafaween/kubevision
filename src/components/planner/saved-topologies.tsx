"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Loader2, FolderOpen, Pencil, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TopologySummary {
  id: string;
  name: string;
  contextName: string | null;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SavedTopologiesProps {
  onClose: () => void;
  onLoad: (nodes: unknown[], edges: unknown[], name: string) => void;
}

export function SavedTopologies({ onClose, onLoad }: SavedTopologiesProps) {
  const [topologies, setTopologies] = useState<TopologySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchTopologies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/topologies");
      const data = await res.json();
      setTopologies(data.topologies || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopologies();
  }, [fetchTopologies]);

  const handleLoad = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/topologies/${id}`);
      const data = await res.json();
      if (data.topology) {
        onLoad(data.topology.nodes, data.topology.edges, data.topology.name);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/topologies?id=${id}`, { method: "DELETE" });
      setTopologies((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silently fail
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await fetch("/api/topologies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: renameValue.trim() }),
      });
      setTopologies((prev) =>
        prev.map((t) => (t.id === id ? { ...t, name: renameValue.trim() } : t))
      );
    } catch {
      // silently fail
    } finally {
      setRenamingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-72 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-xs font-medium">Saved Topologies</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
        </div>
      ) : topologies.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <FolderOpen className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">No saved topologies yet</p>
            <p className="text-[9px] text-muted-foreground/60 mt-1">
              Use the Save button in the toolbar to save your current plan
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {topologies.map((t) => (
              <div
                key={t.id}
                className="group border border-border rounded p-2 hover:border-neon-cyan/30 hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-1">
                  {renamingId === t.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(t.id)}
                        autoFocus
                        className="flex-1 text-[11px] bg-transparent border-b border-neon-cyan focus:outline-none"
                      />
                      <button onClick={() => handleRename(t.id)} className="text-neon-green">
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleLoad(t.id)}
                      className="text-left flex-1 min-w-0"
                      disabled={loadingId === t.id}
                    >
                      <div className="text-[11px] font-medium truncate flex items-center gap-1">
                        {loadingId === t.id && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                        {t.name}
                      </div>
                    </button>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => {
                        setRenamingId(t.id);
                        setRenameValue(t.name);
                      }}
                      className="text-muted-foreground hover:text-neon-cyan p-0.5"
                      title="Rename"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-muted-foreground hover:text-neon-red p-0.5"
                      title="Delete"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-muted-foreground">
                    {t.nodeCount} nodes · {t.edgeCount} edges
                  </span>
                  {t.contextName && (
                    <span className="text-[8px] text-muted-foreground/60 px-1 rounded bg-white/5">
                      {t.contextName}
                    </span>
                  )}
                </div>
                <div className="text-[8px] text-muted-foreground/50 mt-0.5">
                  {formatDate(t.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
