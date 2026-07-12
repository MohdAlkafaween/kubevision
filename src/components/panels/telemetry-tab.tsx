"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, AlertCircle, Activity, Database, Wifi } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { K8sResource } from "@/types/k8s";

interface TelemetryTabProps {
  resource: K8sResource;
  cluster: string | null;
}

interface ParsedLogEntry {
  timestamp?: string;
  level?: string;
  message: string;
  logger?: string;
  fields: Record<string, string>;
}

function detectElasticType(resource: K8sResource): string {
  const name = resource.name.toLowerCase();
  const appName = (resource.labels["app.kubernetes.io/name"] || resource.labels["app"] || "").toLowerCase();

  if (appName.includes("elasticsearch") || name.includes("elasticsearch")) return "elasticsearch";
  if (appName.includes("kibana") || name.includes("kibana")) return "kibana";
  if (appName.includes("filebeat") || name.includes("filebeat")) return "filebeat";
  if (appName.includes("fleet-server") || name.includes("fleet-server")) return "fleet-server";
  if (appName.includes("apm-server") || name.includes("apm-server")) return "apm-server";
  if (appName.includes("logstash") || name.includes("logstash")) return "logstash";
  if (appName.includes("elastic-agent") || name.includes("elastic-agent")) return "elastic-agent";
  return "elastic-operator";
}

function parseLogLine(line: string): ParsedLogEntry {
  const trimmed = line.trim();
  if (!trimmed) return { message: "", fields: {} };

  try {
    const parsed = JSON.parse(trimmed);
    const fields: Record<string, string> = {};
    const skip = new Set(["@timestamp", "timestamp", "log.level", "level", "message", "log.logger", "logger"]);
    for (const [k, v] of Object.entries(parsed)) {
      if (!skip.has(k) && v !== undefined && v !== null) {
        fields[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
    }
    return {
      timestamp: parsed["@timestamp"] || parsed.timestamp,
      level: (parsed["log.level"] || parsed.level || "").toUpperCase(),
      message: parsed.message || trimmed,
      logger: parsed["log.logger"] || parsed.logger,
      fields,
    };
  } catch {
    return { message: trimmed, fields: {} };
  }
}

const levelColors: Record<string, string> = {
  ERROR: "text-neon-red",
  WARN: "text-neon-amber",
  WARNING: "text-neon-amber",
  INFO: "text-neon-green",
  DEBUG: "text-muted-foreground",
  TRACE: "text-muted-foreground/50",
};

const typeInfo: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  elasticsearch: { icon: <Database className="w-3 h-3" />, label: "Elasticsearch", color: "text-[#FEC514]" },
  kibana: { icon: <Activity className="w-3 h-3" />, label: "Kibana", color: "text-[#F04E98]" },
  filebeat: { icon: <Wifi className="w-3 h-3" />, label: "Filebeat", color: "text-[#00BFB3]" },
  "fleet-server": { icon: <Wifi className="w-3 h-3" />, label: "Fleet Server", color: "text-[#00BFB3]" },
  "apm-server": { icon: <Activity className="w-3 h-3" />, label: "APM Server", color: "text-[#F04E98]" },
  logstash: { icon: <Database className="w-3 h-3" />, label: "Logstash", color: "text-[#FEC514]" },
  "elastic-agent": { icon: <Wifi className="w-3 h-3" />, label: "Elastic Agent", color: "text-[#00BFB3]" },
  "elastic-operator": { icon: <Database className="w-3 h-3" />, label: "ECK Operator", color: "text-[#FEC514]" },
};

export function TelemetryTab({ resource, cluster }: TelemetryTabProps) {
  const [logs, setLogs] = useState<ParsedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  const elasticType = detectElasticType(resource);
  const info = typeInfo[elasticType] || typeInfo["elastic-operator"];

  const fetchLogs = useCallback(async () => {
    if (resource.kind !== "Pod" || !cluster) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/logs?context=${encodeURIComponent(cluster)}&pod=${resource.name}&namespace=${resource.namespace || "default"}&tail=200`
      );
      const text = await res.text();
      const lines = text.split("\n").filter(Boolean);
      setLogs(lines.map(parseLogLine).filter(e => e.message));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch telemetry logs");
    } finally {
      setLoading(false);
    }
  }, [resource, cluster]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = levelFilter
    ? logs.filter(e => e.level === levelFilter)
    : logs;

  const errorCount = logs.filter(e => e.level === "ERROR").length;
  const warnCount = logs.filter(e => e.level === "WARN" || e.level === "WARNING").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className={info.color}>{info.icon}</span>
          <span className="text-[10px] font-medium">{info.label}</span>
          {resource.kind !== "Pod" && (
            <span className="text-[9px] text-muted-foreground">(select a pod for logs)</span>
          )}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading || resource.kind !== "Pod"}
          className="text-muted-foreground hover:text-neon-cyan disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </button>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30">
        <button
          onClick={() => setLevelFilter(null)}
          className={`text-[8px] px-1.5 py-0.5 rounded border ${!levelFilter ? "border-neon-cyan/50 text-neon-cyan bg-neon-cyan/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          ALL ({logs.length})
        </button>
        {errorCount > 0 && (
          <button
            onClick={() => setLevelFilter("ERROR")}
            className={`text-[8px] px-1.5 py-0.5 rounded border ${levelFilter === "ERROR" ? "border-neon-red/50 text-neon-red bg-neon-red/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            ERR ({errorCount})
          </button>
        )}
        {warnCount > 0 && (
          <button
            onClick={() => setLevelFilter(levelFilter === "WARN" ? null : "WARN")}
            className={`text-[8px] px-1.5 py-0.5 rounded border ${levelFilter === "WARN" ? "border-neon-amber/50 text-neon-amber bg-neon-amber/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            WARN ({warnCount})
          </button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[10px] text-neon-red flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {filtered.length === 0 && !loading && (
            <div className="text-[10px] text-muted-foreground text-center py-4">
              {resource.kind !== "Pod" ? "Select an Elastic pod to view telemetry logs" : "No log entries found"}
            </div>
          )}
          {filtered.map((entry, i) => (
            <div key={i} className="group px-2 py-1 rounded hover:bg-white/5 text-[9px] font-mono">
              <div className="flex items-start gap-1.5">
                {entry.timestamp && (
                  <span className="text-muted-foreground shrink-0">
                    {entry.timestamp.split("T")[1]?.split(".")[0] || entry.timestamp.slice(-12)}
                  </span>
                )}
                {entry.level && (
                  <Badge
                    variant="outline"
                    className={`text-[7px] px-1 py-0 h-3 shrink-0 ${levelColors[entry.level] || ""}`}
                  >
                    {entry.level}
                  </Badge>
                )}
                <span className="text-foreground/80 break-all">{entry.message}</span>
              </div>
              {entry.logger && (
                <div className="text-[8px] text-muted-foreground/60 pl-14 truncate">
                  {entry.logger}
                </div>
              )}
              {Object.keys(entry.fields).length > 0 && (
                <div className="hidden group-hover:flex flex-wrap gap-1 mt-1 pl-14">
                  {Object.entries(entry.fields).slice(0, 6).map(([k, v]) => (
                    <span key={k} className="text-[7px] px-1 py-0 rounded bg-white/5 text-muted-foreground">
                      {k}: {v.length > 40 ? v.slice(0, 40) + "..." : v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
