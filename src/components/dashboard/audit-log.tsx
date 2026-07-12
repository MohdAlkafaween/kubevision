"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  RefreshCw,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  detail: string;
  user: string;
  cluster: string;
  createdAt: string;
}

const PAGE_SIZE = 50;

function actionColor(action: string): string {
  const a = action.toLowerCase();
  if (a === "create" || a === "install") return a === "install" ? "text-neon-purple" : "text-neon-green";
  if (a === "delete" || a === "uninstall") return "text-neon-red";
  if (a === "exec") return "text-neon-cyan";
  return "text-muted-foreground";
}

function actionDot(action: string): string {
  const a = action.toLowerCase();
  if (a === "create") return "bg-neon-green";
  if (a === "delete" || a === "uninstall") return "bg-neon-red";
  if (a === "exec") return "bg-neon-cyan";
  if (a === "install") return "bg-neon-purple";
  return "bg-muted-foreground";
}

export function AuditLog({ cluster }: { cluster: string | null }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (cluster) params.set("cluster", cluster);
      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [cluster, offset]);

  useEffect(() => {
    setOffset(0);
  }, [cluster]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClear = async () => {
    if (!confirm("Clear all audit log entries? This cannot be undone.")) return;
    setClearing(true);
    try {
      await fetch("/api/audit", { method: "DELETE" });
      setOffset(0);
      await fetchLogs();
    } finally {
      setClearing(false);
    }
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[var(--terminal-header)]">
        <ScrollText className="w-3.5 h-3.5 text-neon-cyan" />
        <span className="text-[11px] text-foreground font-medium">Audit Log</span>
        <span className="text-[10px] text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"}
          {cluster ? ` · ${cluster}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || total === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-neon-red border border-neon-red/30 hover:bg-neon-red/10 transition-colors disabled:opacity-30"
          >
            {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Clear All
          </button>
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ScrollText className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-xs text-muted-foreground mb-1">No audit entries yet</p>
            <p className="text-[10px] text-muted-foreground/60">
              Actions like exec, install, and user changes will appear here
            </p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Resource</th>
                <th className="text-left px-4 py-2 font-medium">Detail</th>
                <th className="text-left px-4 py-2 font-medium">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`flex items-center gap-1.5 font-medium ${actionColor(log.action)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${actionDot(log.action)}`} />
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground font-mono truncate max-w-[220px]">{log.resource}</td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[320px]" title={log.detail}>
                    {log.detail || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono">{log.cluster || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-[var(--terminal-header)]">
          <span className="text-[10px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setOffset((o) => (o + PAGE_SIZE < total ? o + PAGE_SIZE : o))}
              disabled={offset + PAGE_SIZE >= total}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
