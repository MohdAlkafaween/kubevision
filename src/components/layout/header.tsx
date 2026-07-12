"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, Circle, RefreshCw, Bell, Check, Trash2 } from "lucide-react";
import type { ClusterResources } from "@/types/k8s";
import type { AppNotification } from "@/hooks/use-notifications";

interface HeaderProps {
  cluster: string | null;
  resources: ClusterResources | null;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  notifications?: AppNotification[];
  unreadCount?: number;
  onMarkAllRead?: () => void;
  onClearNotifications?: () => void;
  onRequestNotificationPermission?: () => void;
  notificationPermissionGranted?: boolean;
}

export function Header({
  cluster,
  resources,
  loading,
  error,
  onRefresh,
  notifications = [],
  unreadCount = 0,
  onMarkAllRead,
  onClearNotifications,
  onRequestNotificationPermission,
  notificationPermissionGranted,
}: HeaderProps) {
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const nodeCount = resources?.nodes.length || 0;
  const podCount = resources?.pods.length || 0;
  const runningPods = resources?.pods.filter((p) => p.status.ready).length || 0;
  const failedPods = resources?.pods.filter(
    (p) => p.status.phase === "Failed" || (p.status.restartCount && p.status.restartCount > 5)
  ).length || 0;
  const deploymentCount = resources?.deployments.length || 0;
  const serviceCount = resources?.services.length || 0;
  const namespaceCount = resources?.namespaces.length || 0;

  const clusterStatus = !cluster
    ? "disconnected"
    : error
    ? "error"
    : failedPods > 0
    ? "warning"
    : "healthy";

  return (
    <header className="h-10 flex-shrink-0 bg-[var(--terminal-header)] border-b border-border flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Circle
          className={`w-2 h-2 fill-current ${
            clusterStatus === "healthy"
              ? "text-neon-green"
              : clusterStatus === "warning"
              ? "text-neon-amber"
              : clusterStatus === "error"
              ? "text-neon-red"
              : "text-muted-foreground"
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {cluster || "No cluster selected"}
        </span>
        {error && (
          <span className="text-[10px] text-neon-red truncate max-w-[300px]">
            {error}
          </span>
        )}
      </div>

      {resources && (
        <div className="flex items-center gap-3">
          <StatBadge label="Nodes" value={nodeCount} />
          <StatBadge
            label="Pods"
            value={`${runningPods}/${podCount}`}
            variant={failedPods > 0 ? "warning" : "default"}
          />
          <StatBadge label="Deploys" value={deploymentCount} />
          <StatBadge label="Services" value={serviceCount} />
          <StatBadge label="NS" value={namespaceCount} />
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative text-muted-foreground hover:text-neon-amber transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-neon-red text-[8px] text-white flex items-center justify-center font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-8 w-72 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[11px] font-medium">Notifications</span>
                <div className="flex items-center gap-1">
                  {!notificationPermissionGranted && (
                    <button
                      onClick={onRequestNotificationPermission}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/30 transition-colors"
                    >
                      Enable push
                    </button>
                  )}
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllRead}
                      className="text-muted-foreground hover:text-neon-cyan transition-colors"
                      title="Mark all read"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={onClearNotifications}
                      className="text-muted-foreground hover:text-neon-red transition-colors"
                      title="Clear all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      className={`px-3 py-2 border-b border-border/30 last:border-0 text-[11px] ${
                        !n.read ? "bg-neon-cyan/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            n.severity === "critical"
                              ? "bg-neon-red"
                              : n.severity === "warning"
                              ? "bg-neon-amber"
                              : "bg-neon-cyan"
                          }`}
                        />
                        <span className="font-medium">{n.title}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">
                          {new Date(n.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground ml-3">
                        {n.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-muted-foreground hover:text-neon-cyan transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Activity className="w-3 h-3 text-neon-green" />
          <span>Live</span>
        </div>
      </div>
    </header>
  );
}

function StatBadge({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "warning";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <Badge
        variant="outline"
        className={`text-[10px] px-1.5 py-0 h-4 font-mono ${
          variant === "warning"
            ? "border-neon-amber/50 text-neon-amber"
            : "border-border text-foreground"
        }`}
      >
        {value}
      </Badge>
    </div>
  );
}
