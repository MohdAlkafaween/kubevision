"use client";

import React, { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Info,
  RefreshCw,
  Filter,
  Clock,
  Zap,
} from "lucide-react";

interface K8sEventItem {
  type: string;
  resource: {
    kind: string;
    name: string;
    namespace?: string;
  };
  timestamp: string;
}

interface EventTimelineProps {
  events: K8sEventItem[];
}

const eventIcons: Record<string, React.ReactNode> = {
  ADDED: <ArrowUpCircle className="w-3 h-3 text-neon-green" />,
  MODIFIED: <RefreshCw className="w-3 h-3 text-neon-cyan" />,
  DELETED: <ArrowDownCircle className="w-3 h-3 text-neon-red" />,
};

const KIND_COLORS: Record<string, string> = {
  Pod: "border-neon-green/50 text-neon-green",
  Deployment: "border-neon-cyan/50 text-neon-cyan",
  ReplicaSet: "border-neon-cyan/30 text-neon-cyan/70",
  Service: "border-neon-purple/50 text-neon-purple",
  StatefulSet: "border-neon-amber/50 text-neon-amber",
  DaemonSet: "border-neon-amber/30 text-neon-amber/70",
  Node: "border-blue-400/50 text-blue-400",
  ConfigMap: "border-muted-foreground/50 text-muted-foreground",
  Secret: "border-neon-red/30 text-neon-red/70",
  Ingress: "border-neon-purple/30 text-neon-purple/70",
};

interface CorrelationGroup {
  id: string;
  events: K8sEventItem[];
  startTime: Date;
  endTime: Date;
  label: string;
  severity: "info" | "warning" | "critical";
}

function detectCorrelations(events: K8sEventItem[]): CorrelationGroup[] {
  const groups: CorrelationGroup[] = [];
  const window = 30000; // 30s correlation window

  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Detect deployment rollouts: Deployment MODIFIED → ReplicaSet ADDED/MODIFIED → Pod ADDED/DELETED
  const deploymentEvents = sorted.filter(
    (e) => e.resource.kind === "Deployment" && e.type === "MODIFIED"
  );

  for (const deploy of deploymentEvents) {
    const deployTime = new Date(deploy.timestamp).getTime();
    const related = sorted.filter((e) => {
      if (e === deploy) return false;
      const t = new Date(e.timestamp).getTime();
      if (Math.abs(t - deployTime) > window) return false;
      const name = deploy.resource.name;
      return (
        (e.resource.kind === "ReplicaSet" && e.resource.name.startsWith(name)) ||
        (e.resource.kind === "Pod" && e.resource.name.startsWith(name))
      );
    });

    if (related.length > 0) {
      const allEvents = [deploy, ...related];
      const times = allEvents.map((e) => new Date(e.timestamp).getTime());
      const deletedPods = related.filter(
        (e) => e.resource.kind === "Pod" && e.type === "DELETED"
      );
      groups.push({
        id: `rollout-${deploy.resource.name}-${deployTime}`,
        events: allEvents,
        startTime: new Date(Math.min(...times)),
        endTime: new Date(Math.max(...times)),
        label: `Rollout: ${deploy.resource.name}`,
        severity: deletedPods.length > 0 ? "warning" : "info",
      });
    }
  }

  // Detect pod crashes: Pod DELETED shortly after Pod ADDED (same name prefix)
  const podDeletes = sorted.filter(
    (e) => e.resource.kind === "Pod" && e.type === "DELETED"
  );
  for (const del of podDeletes) {
    const delTime = new Date(del.timestamp).getTime();
    const namePrefix = del.resource.name.replace(/-[a-z0-9]{5,}$/, "");
    const restarted = sorted.find((e) => {
      if (e === del || e.resource.kind !== "Pod" || e.type !== "ADDED") return false;
      const t = new Date(e.timestamp).getTime();
      return (
        Math.abs(t - delTime) < window &&
        e.resource.name.startsWith(namePrefix) &&
        e.resource.namespace === del.resource.namespace
      );
    });

    if (restarted) {
      const already = groups.some((g) =>
        g.events.some((e) => e === del || e === restarted)
      );
      if (!already) {
        groups.push({
          id: `crash-${del.resource.name}-${delTime}`,
          events: [del, restarted],
          startTime: new Date(Math.min(delTime, new Date(restarted.timestamp).getTime())),
          endTime: new Date(Math.max(delTime, new Date(restarted.timestamp).getTime())),
          label: `Pod restart: ${namePrefix}`,
          severity: "critical",
        });
      }
    }
  }

  return groups;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function groupByTime(events: K8sEventItem[]): Map<string, K8sEventItem[]> {
  const groups = new Map<string, K8sEventItem[]>();
  for (const event of events) {
    const date = new Date(event.timestamp);
    const now = new Date();
    let key: string;
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 60000) key = "Just now";
    else if (diffMs < 300000) key = "Last 5 minutes";
    else if (diffMs < 900000) key = "Last 15 minutes";
    else if (diffMs < 3600000) key = "Last hour";
    else key = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showCorrelations, setShowCorrelations] = useState(true);

  const kinds = useMemo(
    () => [...new Set(events.map((e) => e.resource.kind))].sort(),
    [events]
  );

  const filtered = useMemo(() => {
    let result = events;
    if (filterKind) result = result.filter((e) => e.resource.kind === filterKind);
    if (filterType) result = result.filter((e) => e.type === filterType);
    return result;
  }, [events, filterKind, filterType]);

  const correlations = useMemo(
    () => (showCorrelations ? detectCorrelations(events) : []),
    [events, showCorrelations]
  );

  const timeGroups = useMemo(() => groupByTime(filtered), [filtered]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Info className="w-5 h-5" />
        <p className="text-xs">Waiting for events...</p>
        <p className="text-[10px]">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 overflow-x-auto">
        <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
        <button
          onClick={() => setFilterType(null)}
          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
            !filterType
              ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {["ADDED", "MODIFIED", "DELETED"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(filterType === t ? null : t)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
              filterType === t
                ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="w-px h-4 bg-border shrink-0" />
        {kinds.slice(0, 6).map((k) => (
          <button
            key={k}
            onClick={() => setFilterKind(filterKind === k ? null : k)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
              filterKind === k
                ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {k}
          </button>
        ))}
        <div className="ml-auto shrink-0">
          <button
            onClick={() => setShowCorrelations(!showCorrelations)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              showCorrelations
                ? "bg-neon-purple/10 border-neon-purple/50 text-neon-purple"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="w-2.5 h-2.5" />
            Correlate
          </button>
        </div>
      </div>

      {/* Correlations banner */}
      {correlations.length > 0 && (
        <div className="px-3 py-2 border-b border-border space-y-1 shrink-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3 text-neon-purple" />
            Correlated events
          </div>
          {correlations.slice(0, 5).map((group) => (
            <div
              key={group.id}
              className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] border ${
                group.severity === "critical"
                  ? "bg-neon-red/5 border-neon-red/30 text-neon-red"
                  : group.severity === "warning"
                  ? "bg-neon-amber/5 border-neon-amber/30 text-neon-amber"
                  : "bg-neon-cyan/5 border-neon-cyan/30 text-neon-cyan"
              }`}
            >
              <span className="font-medium">{group.label}</span>
              <span className="text-muted-foreground">
                {group.events.length} events
              </span>
              <span className="ml-auto text-muted-foreground">
                {timeAgo(group.startTime.toISOString())}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {[...timeGroups.entries()].map(([timeLabel, groupEvents]) => (
            <div key={timeLabel} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {timeLabel}
                </span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[9px] text-muted-foreground">
                  {groupEvents.length}
                </span>
              </div>
              <div className="ml-1.5 border-l border-border/50 pl-3 space-y-0.5">
                {groupEvents.map((event, i) => {
                  const kindColor =
                    KIND_COLORS[event.resource.kind] ||
                    "border-border text-muted-foreground";
                  const isCorrelated = correlations.some((g) =>
                    g.events.some(
                      (e) =>
                        e.resource.name === event.resource.name &&
                        e.timestamp === event.timestamp
                    )
                  );

                  return (
                    <div
                      key={`${event.timestamp}-${i}`}
                      className={`flex items-start gap-2 py-1.5 relative ${
                        isCorrelated ? "bg-neon-purple/5 -mx-1 px-1 rounded" : ""
                      }`}
                    >
                      <div className="absolute -left-[15.5px] top-2.5 w-2 h-2 rounded-full border-2 border-[var(--terminal-bg)] bg-border" />
                      <div className="mt-0.5 shrink-0">
                        {eventIcons[event.type] || (
                          <AlertCircle className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[8px] px-1 py-0 h-3 shrink-0 ${kindColor}`}
                          >
                            {event.resource.kind}
                          </Badge>
                          <span className="text-[10px] font-medium truncate">
                            {event.resource.name}
                          </span>
                          {isCorrelated && (
                            <Zap className="w-2.5 h-2.5 text-neon-purple shrink-0" />
                          )}
                        </div>
                        {event.resource.namespace && (
                          <span className="text-[9px] text-muted-foreground">
                            {event.resource.namespace}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-muted-foreground shrink-0">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
