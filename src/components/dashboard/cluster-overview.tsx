"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Box,
  Cpu,
  HardDrive,
  Layers,
  Network,
  Server,
  FolderOpen,
  ChevronRight,
  Shield,
  Activity,
} from "lucide-react";
import type { ClusterResources, K8sResource } from "@/types/k8s";

interface ClusterOverviewProps {
  resources: ClusterResources | null;
  cluster: string | null;
}

function filterByNs(list: K8sResource[], ns: string | null): K8sResource[] {
  if (!ns) return list;
  return list.filter((r) => r.namespace === ns);
}

export function ClusterOverview({ resources, cluster }: ClusterOverviewProps) {
  const [selectedNs, setSelectedNs] = useState<string | null>(null);

  const namespaces = useMemo(() => {
    if (!resources) return [];
    return resources.namespaces
      .map((n) => n.name)
      .sort((a, b) => a.localeCompare(b));
  }, [resources]);

  const nsStats = useMemo(() => {
    if (!resources) return new Map<string, { pods: number; running: number; deploys: number; services: number }>();
    const map = new Map<string, { pods: number; running: number; deploys: number; services: number }>();
    for (const ns of namespaces) {
      const pods = resources.pods.filter((p) => p.namespace === ns);
      map.set(ns, {
        pods: pods.length,
        running: pods.filter((p) => p.status.ready).length,
        deploys: resources.deployments.filter((d) => d.namespace === ns).length,
        services: resources.services.filter((s) => s.namespace === ns).length,
      });
    }
    return map;
  }, [resources, namespaces]);

  if (!resources) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {cluster ? "Loading resources..." : "Select a cluster to view overview"}
      </div>
    );
  }

  const pods = filterByNs(resources.pods, selectedNs);
  const deployments = filterByNs(resources.deployments, selectedNs);
  const services = filterByNs(resources.services, selectedNs);
  const statefulSets = filterByNs(resources.statefulSets, selectedNs);
  const daemonSets = filterByNs(resources.daemonSets, selectedNs);
  const ingresses = filterByNs(resources.ingresses, selectedNs);
  const configMaps = filterByNs(resources.configMaps, selectedNs);
  const secrets = filterByNs(resources.secrets, selectedNs);
  const pvcs = filterByNs(resources.pvcs, selectedNs);
  const jobs = filterByNs(resources.jobs, selectedNs);
  const cronJobs = filterByNs(resources.cronJobs, selectedNs);
  const networkPolicies = filterByNs(resources.networkPolicies, selectedNs);
  const replicaSets = filterByNs(resources.replicaSets, selectedNs);

  const totalPods = pods.length;
  const runningPods = pods.filter((p) => p.status.ready).length;
  const failedPods = pods.filter(
    (p) => !p.status.ready && (p.status.phase === "Failed" || p.status.phase === "CrashLoopBackOff")
  ).length;
  const pendingPods = pods.filter((p) => p.status.phase === "Pending").length;

  const totalNodes = resources.nodes.length;
  const readyNodes = resources.nodes.filter((n) => n.status.ready).length;

  const healthScore = totalPods > 0 ? Math.round((runningPods / totalPods) * 100) : 0;
  const healthColor =
    healthScore >= 90 ? "text-neon-green" : healthScore >= 70 ? "text-neon-amber" : "text-neon-red";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Namespace sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-border bg-[var(--terminal-bg)] flex flex-col min-h-0 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="text-[10px] text-neon-cyan uppercase tracking-widest font-semibold">
            Namespaces
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            {namespaces.length} total
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {/* All cluster button */}
            <button
              onClick={() => setSelectedNs(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left transition-colors ${
                selectedNs === null
                  ? "bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium">All Namespaces</div>
                <div className="text-[9px] opacity-60">
                  {resources.pods.length} pods, {resources.deployments.length} deploys
                </div>
              </div>
            </button>

            {/* Per-namespace buttons */}
            {namespaces.map((ns) => {
              const stats = nsStats.get(ns);
              const isActive = selectedNs === ns;
              const hasIssues = stats && stats.pods > 0 && stats.running < stats.pods;

              return (
                <button
                  key={ns}
                  onClick={() => setSelectedNs(ns)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left transition-colors ${
                    isActive
                      ? "bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan"
                      : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${hasIssues ? "text-neon-amber" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{ns}</div>
                    <div className="text-[9px] opacity-60">
                      {stats ? `${stats.running}/${stats.pods} pods` : "0 pods"}
                      {stats && stats.deploys > 0 ? ` · ${stats.deploys} deploy` : ""}
                    </div>
                  </div>
                  <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`} />
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main overview content */}
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="p-4 space-y-4">
          {/* Header with health score */}
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-bold ${healthColor}`}>{healthScore}%</div>
            <div>
              <div className="text-xs text-muted-foreground">
                {selectedNs ? "Namespace Health" : "Cluster Health"}
              </div>
              <div className="text-sm font-medium flex items-center gap-2">
                {cluster}
                {selectedNs && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-neon-cyan/40 text-neon-cyan">
                    {selectedNs}
                  </Badge>
                )}
              </div>
            </div>
            {selectedNs && (
              <button
                onClick={() => setSelectedNs(null)}
                className="ml-auto text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-neon-cyan/30 transition-colors"
              >
                View All
              </button>
            )}
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {!selectedNs && (
              <MetricCard
                icon={<Server className="w-4 h-4" />}
                label="Nodes"
                value={`${readyNodes}/${totalNodes}`}
                status={readyNodes === totalNodes ? "healthy" : "warning"}
              />
            )}
            <MetricCard
              icon={<Box className="w-4 h-4" />}
              label="Pods"
              value={`${runningPods}/${totalPods}`}
              status={failedPods > 0 ? "critical" : pendingPods > 0 ? "warning" : "healthy"}
              detail={failedPods > 0 ? `${failedPods} failed` : pendingPods > 0 ? `${pendingPods} pending` : undefined}
            />
            <MetricCard
              icon={<Layers className="w-4 h-4" />}
              label="Deployments"
              value={String(deployments.length)}
              status="healthy"
            />
            <MetricCard
              icon={<Network className="w-4 h-4" />}
              label="Services"
              value={String(services.length)}
              status="healthy"
            />
            <MetricCard
              icon={<HardDrive className="w-4 h-4" />}
              label="PVCs"
              value={String(pvcs.length)}
              status="healthy"
            />
            {!selectedNs && (
              <MetricCard
                icon={<Cpu className="w-4 h-4" />}
                label="Namespaces"
                value={String(resources.namespaces.length)}
                status="healthy"
              />
            )}
            {selectedNs && (
              <MetricCard
                icon={<Shield className="w-4 h-4" />}
                label="Network Policies"
                value={String(networkPolicies.length)}
                status="healthy"
              />
            )}
          </div>

          {/* Pod details table for selected namespace */}
          {selectedNs && pods.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  Pods in {selectedNs}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-1">
                  {pods.map((pod) => (
                    <div
                      key={pod.uid}
                      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/20 transition-colors"
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          pod.status.ready
                            ? "bg-neon-green"
                            : pod.status.phase === "Pending"
                            ? "bg-neon-amber"
                            : "bg-neon-red"
                        }`}
                      />
                      <span className="text-[11px] text-foreground truncate flex-1">{pod.name}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{pod.status.phase}</span>
                      {pod.status.restartCount !== undefined && pod.status.restartCount > 0 && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-neon-amber/10 text-neon-amber shrink-0">
                          {pod.status.restartCount} restarts
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deployments table for selected namespace */}
          {selectedNs && deployments.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  Deployments in {selectedNs}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-1">
                  {deployments.map((d) => {
                    const raw = d.raw as Record<string, unknown>;
                    const spec = (raw?.spec || {}) as Record<string, unknown>;
                    const status = (raw?.status || {}) as Record<string, unknown>;
                    const replicas = (spec.replicas as number) ?? 1;
                    const ready = (status.readyReplicas as number) ?? 0;

                    return (
                      <div
                        key={d.uid}
                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/20 transition-colors"
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            ready >= replicas ? "bg-neon-green" : ready > 0 ? "bg-neon-amber" : "bg-neon-red"
                          }`}
                        />
                        <span className="text-[11px] text-foreground truncate flex-1">{d.name}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {ready}/{replicas} ready
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Services table for selected namespace */}
          {selectedNs && services.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  Services in {selectedNs}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-1">
                  {services.map((s) => {
                    const raw = s.raw as Record<string, unknown>;
                    const spec = (raw?.spec || {}) as Record<string, unknown>;
                    const svcType = (spec.type as string) || "ClusterIP";

                    return (
                      <div
                        key={s.uid}
                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/20 transition-colors"
                      >
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-neon-blue" />
                        <span className="text-[11px] text-foreground truncate flex-1">{s.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/30 text-muted-foreground shrink-0">
                          {svcType}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pods by Namespace (only in "All" view) */}
          {!selectedNs && (
            <Card className="bg-card border-border">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  Pods by Namespace
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  {namespaces.map((ns) => {
                    const stats = nsStats.get(ns);
                    if (!stats || stats.pods === 0) return null;
                    const pct = (stats.running / stats.pods) * 100;

                    return (
                      <button
                        key={ns}
                        onClick={() => setSelectedNs(ns)}
                        className="w-full space-y-1 text-left hover:bg-accent/10 rounded p-1 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-foreground">{ns}</span>
                          <span className="text-muted-foreground">
                            {stats.running}/{stats.pods}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct === 100
                                ? "bg-neon-green"
                                : pct >= 50
                                ? "bg-neon-amber"
                                : "bg-neon-red"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resource Summary */}
          <Card className="bg-card border-border">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                Resource Summary {selectedNs && `— ${selectedNs}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <SummaryRow label="ReplicaSets" value={replicaSets.length} />
                <SummaryRow label="StatefulSets" value={statefulSets.length} />
                <SummaryRow label="DaemonSets" value={daemonSets.length} />
                <SummaryRow label="Ingresses" value={ingresses.length} />
                <SummaryRow label="ConfigMaps" value={configMaps.length} />
                <SummaryRow label="Secrets" value={secrets.length} />
                <SummaryRow label="Jobs" value={jobs.length} />
                <SummaryRow label="CronJobs" value={cronJobs.length} />
                <SummaryRow label="NetworkPolicies" value={networkPolicies.length} />
                {!selectedNs && <SummaryRow label="PersistentVolumes" value={resources.pvs.length} />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  status,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: "healthy" | "warning" | "critical";
  detail?: string;
}) {
  const borderClass =
    status === "healthy"
      ? "border-neon-green/20"
      : status === "warning"
      ? "border-neon-amber/20"
      : "border-neon-red/20";
  const valueClass =
    status === "healthy"
      ? "text-neon-green"
      : status === "warning"
      ? "text-neon-amber"
      : "text-neon-red";

  return (
    <Card className={`bg-card ${borderClass}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
          {icon}
          <span className="text-[10px] uppercase tracking-wider">{label}</span>
        </div>
        <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
        {detail && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-neon-red/50 text-neon-red">
            {detail}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
