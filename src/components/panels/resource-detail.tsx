"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Copy, Check, Play, Pencil, Save, Loader2, Undo2, RotateCcw, Square, Trash2, PlayCircle, TerminalSquare, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { K8sResource, CommandSuggestion } from "@/types/k8s";
import { getCommandSuggestions } from "@/lib/k8s/commands";
import { DiffModal } from "./diff-modal";
import { TelemetryTab } from "./telemetry-tab";
import { PortForwardManager } from "./port-forward-manager";
import { DependencyGraph } from "./dependency-graph";

const ELASTIC_NAMES = ["elasticsearch", "kibana", "filebeat", "fleet-server", "apm-server", "logstash", "elastic-operator", "elastic-agent"];

function isElasticResource(resource: K8sResource): boolean {
  const appName = (resource.labels["app.kubernetes.io/name"] || resource.labels["app"] || "").toLowerCase();
  const name = resource.name.toLowerCase();
  const ns = (resource.namespace || "").toLowerCase();
  if (ns === "elastic-system") return true;
  return ELASTIC_NAMES.some(e => appName.includes(e) || name.includes(e));
}

const RESTARTABLE = ["Deployment", "StatefulSet", "DaemonSet"];
const SCALABLE = ["Deployment", "StatefulSet"];
const DELETABLE = ["Pod", "Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob", "Service", "Ingress", "ConfigMap", "Secret"];

interface ResourceDetailProps {
  resource: K8sResource | null;
  cluster: string | null;
  onClose: () => void;
  onRunCommand: (command: string) => void;
  onRefresh?: () => void;
  onExecPod?: (podName: string, namespace: string, container?: string) => void;
  onNavigateDependency?: (kind: string, name: string, namespace?: string) => void;
}

interface LiveLog {
  time: string;
  text: string;
  type: "info" | "success" | "error" | "wait";
}

export function ResourceDetail({
  resource,
  cluster,
  onClose,
  onRunCommand,
  onRefresh,
  onExecPod,
  onNavigateDependency,
}: ResourceDetailProps) {
  const [copied, setCopied] = useState(false);
  const [showContainerPicker, setShowContainerPicker] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedYaml, setEditedYaml] = useState("");
  const [diffData, setDiffData] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const liveLogRef = useRef<HTMLDivElement>(null);
  let commands: CommandSuggestion[] = [];
  try {
    commands = resource ? getCommandSuggestions(resource) : [];
  } catch {
    commands = [];
  }

  const addLog = useCallback((text: string, type: LiveLog["type"] = "info") => {
    setLiveLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), text, type }]);
  }, []);

  useEffect(() => {
    if (liveLogRef.current) {
      liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }
  }, [liveLogs]);

  const runKubectl = useCallback(async (command: string, ctx: string): Promise<{ success: boolean; output: string }> => {
    const res = await fetch("/api/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, context: ctx }),
    });
    const data = await res.json();
    return { success: data.success, output: data.stdout || data.stderr || "" };
  }, []);

  const getReplicaCount = useCallback((r: K8sResource): number => {
    const spec = ((r.raw as Record<string, unknown>)?.spec || {}) as Record<string, unknown>;
    return (spec.replicas as number) ?? 1;
  }, []);

  const executeAction = useCallback(async (action: "restart" | "stop" | "start" | "delete") => {
    if (!resource || !cluster) return;
    const ns = resource.namespace || "default";
    const kind = resource.kind.toLowerCase();
    const name = resource.name;

    setActionLoading(action);
    setLiveLogs([]);

    if (action === "delete") {
      if (!confirm(`Delete ${resource.kind}/${name}? This cannot be undone.`)) {
        setActionLoading(null);
        return;
      }
      addLog(`Deleting ${resource.kind}/${name}...`);
      const result = await runKubectl(`kubectl delete ${kind} ${name} --namespace=${ns}`, cluster);
      addLog(result.output.trim(), result.success ? "success" : "error");
      if (result.success) {
        onRefresh?.();
        setTimeout(() => onClose(), 1500);
      }
      setActionLoading(null);
      return;
    }

    if (action === "stop") {
      addLog(`Scaling ${resource.kind}/${name} to 0 replicas...`);
      const result = await runKubectl(`kubectl scale ${kind}/${name} --replicas=0 --namespace=${ns}`, cluster);
      addLog(result.output.trim() || "Scaled to 0", result.success ? "success" : "error");
      if (result.success) onRefresh?.();
      setActionLoading(null);
      return;
    }

    if (action === "start") {
      const replicas = getReplicaCount(resource);
      const target = replicas > 0 ? replicas : 1;
      addLog(`Scaling ${resource.kind}/${name} to ${target} replicas...`);
      const result = await runKubectl(`kubectl scale ${kind}/${name} --replicas=${target} --namespace=${ns}`, cluster);
      addLog(result.output.trim() || `Scaled to ${target}`, result.success ? "success" : "error");
      if (result.success) onRefresh?.();
      setActionLoading(null);
      return;
    }

    if (action === "restart") {
      addLog(`Starting graceful restart of ${resource.kind}/${name}`, "info");

      // Step 1: get current replica count
      const replicas = getReplicaCount(resource);
      const targetReplicas = replicas > 0 ? replicas : 1;
      addLog(`Current replicas: ${replicas}`);

      // Step 2: scale to 0
      addLog(`Scaling to 0 replicas...`);
      const stopResult = await runKubectl(`kubectl scale ${kind}/${name} --replicas=0 --namespace=${ns}`, cluster);
      if (!stopResult.success) {
        addLog(stopResult.output.trim() || "Scale down failed", "error");
        setActionLoading(null);
        return;
      }
      addLog("Scaled to 0", "success");
      onRefresh?.();

      // Step 3: wait 20 seconds with live countdown
      addLog("Waiting 20 seconds for pods to terminate...", "wait");
      for (let i = 20; i > 0; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);

      // Step 4: check pod status
      addLog("Checking pod status...");
      const checkResult = await runKubectl(
        `kubectl get pods -l app=${name} --namespace=${ns} --no-headers`,
        cluster
      );
      if (checkResult.output.trim()) {
        addLog(`Pods still running:\n${checkResult.output.trim()}`, "info");
      } else {
        addLog("All pods terminated", "success");
      }

      // Step 5: scale back up
      addLog(`Scaling back to ${targetReplicas} replicas...`);
      const startResult = await runKubectl(`kubectl scale ${kind}/${name} --replicas=${targetReplicas} --namespace=${ns}`, cluster);
      if (!startResult.success) {
        addLog(startResult.output.trim() || "Scale up failed", "error");
        setActionLoading(null);
        return;
      }
      addLog(`Scaled to ${targetReplicas}`, "success");

      // Step 6: watch rollout
      addLog("Monitoring rollout status...", "wait");
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusResult = await runKubectl(
          `kubectl get ${kind}/${name} --namespace=${ns} -o jsonpath='{.status.readyReplicas}/{.spec.replicas}'`,
          cluster
        );
        const status = statusResult.output.replace(/'/g, "");
        addLog(`Ready: ${status || "0/?"}`);
        const [ready, total] = status.split("/").map(Number);
        if (ready >= total && total > 0) {
          addLog(`Restart complete! All ${total} replicas ready.`, "success");
          break;
        }
        if (i === 9) {
          addLog("Rollout still in progress. Check back shortly.", "info");
        }
      }

      onRefresh?.();
      setActionLoading(null);
    }
  }, [resource, cluster, addLog, runKubectl, getReplicaCount, onRefresh, onClose]);

  const canRestart = resource ? RESTARTABLE.includes(resource.kind) : false;
  const canScale = resource ? SCALABLE.includes(resource.kind) : false;
  const canDelete = resource ? DELETABLE.includes(resource.kind) : false;
  const canDeletePod = resource?.kind === "Pod";
  const canExec = resource?.kind === "Pod";
  const containerNames = useMemo(
    () => resource?.status.containerStatuses?.map((cs) => cs.name) ?? [],
    [resource]
  );

  const execIntoPod = useCallback((containerName?: string) => {
    if (!resource) return;
    const ns = resource.namespace || "default";
    const name = resource.name;
    setShowContainerPicker(false);
    if (onExecPod) {
      onExecPod(name, ns, containerName);
      return;
    }
    const containerFlag = containerName ? ` -c ${containerName}` : "";
    onRunCommand(`kubectl exec -it ${name} -n ${ns}${containerFlag} -- /bin/sh`);
  }, [resource, onExecPod, onRunCommand]);

  const handleExecClick = useCallback(() => {
    if (containerNames.length > 1) {
      setShowContainerPicker((v) => !v);
      return;
    }
    execIntoPod(containerNames[0]);
  }, [containerNames, execIntoPod]);

  useEffect(() => {
    if (resource?.kind === "Pod" && cluster) {
      setLogsLoading(true);
      fetch(
        `/api/logs?context=${encodeURIComponent(cluster)}&pod=${resource.name}&namespace=${resource.namespace || "default"}&tail=100`
      )
        .then((res) => res.text())
        .then((text) => setLogs(text))
        .catch(() => setLogs("Failed to fetch logs"))
        .finally(() => setLogsLoading(false));
    } else {
      setLogs(null);
    }
  }, [resource, cluster]);

  useEffect(() => {
    setLiveLogs([]);
    setActionLoading(null);
    setCountdown(null);
    setShowContainerPicker(false);
  }, [resource?.uid]);

  if (!resource) return null;

  const yaml = JSON.stringify(resource.raw, null, 2);

  const copyYaml = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-[380px] flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 border-neon-cyan/50 text-neon-cyan shrink-0"
          >
            {resource.kind}
          </Badge>
          <span className="text-xs font-medium truncate">{resource.name}</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick action buttons — always visible */}
      {(canRestart || canScale || canDelete || canExec) && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-[var(--terminal-header)]/50 relative">
          {canExec && (
            <div className="relative">
              <button
                onClick={handleExecClick}
                disabled={!!actionLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10 transition-colors disabled:opacity-40"
              >
                <TerminalSquare className="w-3 h-3" />
                Shell
                {containerNames.length > 1 && <ChevronDown className="w-2.5 h-2.5" />}
              </button>
              {showContainerPicker && containerNames.length > 1 && (
                <div className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded border border-border bg-[var(--terminal-bg)] shadow-lg overflow-hidden">
                  {containerNames.map((cname) => (
                    <button
                      key={cname}
                      onClick={() => execIntoPod(cname)}
                      className="w-full text-left px-2.5 py-1.5 text-[10px] text-foreground/80 hover:bg-neon-purple/10 hover:text-neon-purple transition-colors truncate"
                    >
                      {cname}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canScale && (
            <button
              onClick={() => executeAction("start")}
              disabled={!!actionLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-neon-green/30 text-neon-green hover:bg-neon-green/10 transition-colors disabled:opacity-40"
            >
              {actionLoading === "start" ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
              Start
            </button>
          )}
          {canScale && (
            <button
              onClick={() => executeAction("stop")}
              disabled={!!actionLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-neon-amber/30 text-neon-amber hover:bg-neon-amber/10 transition-colors disabled:opacity-40"
            >
              {actionLoading === "stop" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              Stop
            </button>
          )}
          {canRestart && (
            <button
              onClick={() => executeAction("restart")}
              disabled={!!actionLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors disabled:opacity-40"
            >
              {actionLoading === "restart" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Restart
            </button>
          )}
          {(canDelete || canDeletePod) && (
            <button
              onClick={() => executeAction("delete")}
              disabled={!!actionLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-colors disabled:opacity-40 ml-auto"
            >
              {actionLoading === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          )}
        </div>
      )}

      {/* Live action log */}
      {liveLogs.length > 0 && (
        <div className="border-b border-border max-h-[200px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 bg-black/20">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Live Output {countdown !== null && <span className="text-neon-amber">({countdown}s)</span>}
            </span>
            {!actionLoading && (
              <button onClick={() => setLiveLogs([])} className="text-[9px] text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
          </div>
          <div ref={liveLogRef} className="flex-1 overflow-y-auto px-3 py-1.5">
            {liveLogs.map((log, i) => (
              <div key={i} className="flex gap-1.5 py-0.5">
                <span className="text-[8px] text-muted-foreground/60 shrink-0">{log.time}</span>
                <span className={`text-[9px] leading-relaxed ${
                  log.type === "success" ? "text-neon-green" :
                  log.type === "error" ? "text-neon-red" :
                  log.type === "wait" ? "text-neon-amber" :
                  "text-foreground/70"
                }`}>
                  {log.type === "wait" && <span className="inline-block w-1 h-1 rounded-full bg-neon-amber animate-pulse mr-1 align-middle" />}
                  {log.text}
                </span>
              </div>
            ))}
            {actionLoading && (
              <div className="flex items-center gap-1 py-0.5">
                <Loader2 className="w-2.5 h-2.5 text-neon-cyan animate-spin" />
                <span className="text-[9px] text-neon-cyan">Working...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="bg-[var(--terminal-header)] border-b border-border rounded-none h-8 shrink-0">
          <TabsTrigger value="info" className="text-[10px] h-6 data-[state=active]:text-neon-cyan">
            Info
          </TabsTrigger>
          <TabsTrigger value="yaml" className="text-[10px] h-6 data-[state=active]:text-neon-cyan">
            YAML
          </TabsTrigger>
          {resource.kind === "Pod" && (
            <TabsTrigger value="logs" className="text-[10px] h-6 data-[state=active]:text-neon-cyan">
              Logs
            </TabsTrigger>
          )}
          {isElasticResource(resource) && (
            <TabsTrigger value="telemetry" className="text-[10px] h-6 data-[state=active]:text-[#FEC514]">
              Telemetry
            </TabsTrigger>
          )}
          <TabsTrigger value="commands" className="text-[10px] h-6 data-[state=active]:text-neon-cyan">
            Commands
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full p-3">
            <div className="space-y-3 text-xs">
              <InfoRow label="Name" value={resource.name} />
              <InfoRow label="Namespace" value={resource.namespace || "—"} />
              <InfoRow label="UID" value={resource.uid} mono />
              <InfoRow label="Created" value={resource.creationTimestamp} />
              <InfoRow label="Phase" value={resource.status.phase} />
              <InfoRow
                label="Ready"
                value={resource.status.ready ? "Yes" : "No"}
                color={resource.status.ready ? "text-neon-green" : "text-neon-red"}
              />
              {resource.status.restartCount !== undefined && (
                <InfoRow
                  label="Restarts"
                  value={String(resource.status.restartCount)}
                  color={resource.status.restartCount > 3 ? "text-neon-amber" : undefined}
                />
              )}

              {resource.status.conditions && resource.status.conditions.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                    Conditions
                  </div>
                  {resource.status.conditions.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0"
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          c.status === "True" ? "bg-neon-green" : "bg-neon-red"
                        }`}
                      />
                      <span className="text-[10px]">{c.type}</span>
                      {c.reason && (
                        <span className="text-[9px] text-muted-foreground ml-auto">
                          {c.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resource.status.containerStatuses &&
                resource.status.containerStatuses.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                      Containers
                    </div>
                    {resource.status.containerStatuses.map((cs, i) => (
                      <div key={i} className="py-1.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              cs.ready ? "bg-neon-green" : "bg-neon-red"
                            }`}
                          />
                          <span className="text-[10px] font-medium">{cs.name}</span>
                          <Badge
                            variant="outline"
                            className="text-[8px] px-1 py-0 h-3 ml-auto"
                          >
                            {cs.state}
                          </Badge>
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5 pl-3.5 truncate">
                          {cs.image}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {resource.kind === "Node" && (() => {
                const raw = resource.raw as Record<string, unknown> | null;
                const status = ((raw?.status || {}) as Record<string, unknown>);
                const addresses = (status.addresses || []) as Array<{ type: string; address: string }>;
                const tsIp = addresses.find(a => a.address?.startsWith("100."));
                const tsAnnotation = resource.annotations["tailscale.com/ip"] || resource.annotations["tailscale.com/node-ip"];
                const ip = tsIp?.address || tsAnnotation;
                if (!ip) return null;
                return (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                      Network Overlay
                    </div>
                    <div className="flex items-center gap-2 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#7C4DFF] animate-pulse" />
                      <span className="text-[10px] text-[#7C4DFF] font-medium">Tailscale</span>
                      <span className="text-[10px] text-foreground/80 ml-auto font-mono">{ip}</span>
                    </div>
                  </div>
                );
              })()}

              {(resource.kind === "Pod" || resource.kind === "Service") && cluster && (() => {
                const raw = resource.raw as Record<string, unknown> | null;
                const spec = (raw?.spec || {}) as Record<string, unknown>;
                let ports: number[] = [];
                if (resource.kind === "Pod") {
                  const containers = (spec.containers || []) as Array<{ ports?: Array<{ containerPort: number }> }>;
                  ports = containers.flatMap(c => (c.ports || []).map(p => p.containerPort));
                } else {
                  const svcPorts = (spec.ports || []) as Array<{ port: number }>;
                  ports = svcPorts.map(p => p.port);
                }
                if (ports.length === 0) return null;
                return (
                  <PortForwardManager
                    resourceName={resource.name}
                    resourceKind={resource.kind}
                    namespace={resource.namespace || "default"}
                    cluster={cluster}
                    ports={ports}
                  />
                );
              })()}

              <DependencyGraph resource={resource} onNavigate={onNavigateDependency} />

              {Object.keys(resource.labels).length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                    Labels
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(resource.labels).map(([k, v]) => (
                      <Badge
                        key={k}
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-4"
                      >
                        {k}={v}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="yaml" className="flex-1 overflow-hidden mt-0 flex flex-col">
          <div className="flex items-center justify-between p-1.5 border-b border-border/50">
            <div className="flex items-center gap-1">
              {!editing ? (
                <button
                  onClick={() => {
                    setEditing(true);
                    setEditedYaml(yaml);
                    setYamlError(null);
                  }}
                  className="text-muted-foreground hover:text-neon-cyan text-[10px] flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setYamlError(null);
                    }}
                    className="text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1"
                  >
                    <Undo2 className="w-3 h-3" />
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        JSON.parse(editedYaml);
                      } catch {
                        setYamlError("Invalid JSON syntax");
                        return;
                      }
                      setYamlError(null);
                      setDiffLoading(true);
                      try {
                        const res = await fetch("/api/diff", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ yaml: editedYaml, context: cluster }),
                        });
                        const data = await res.json();
                        if (data.error && typeof data.error === "string") {
                          setYamlError(data.error);
                        } else if (data.diff) {
                          setDiffData(data.diff);
                        } else {
                          setYamlError("No changes detected");
                        }
                      } catch (err) {
                        setYamlError(err instanceof Error ? err.message : "Diff failed");
                      } finally {
                        setDiffLoading(false);
                      }
                    }}
                    disabled={diffLoading}
                    className="text-neon-green hover:text-neon-green/80 text-[10px] flex items-center gap-1 ml-2"
                  >
                    {diffLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Review & Apply
                  </button>
                </>
              )}
            </div>
            <button
              onClick={copyYaml}
              className="text-muted-foreground hover:text-neon-cyan text-[10px] flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {yamlError && (
            <div className="px-3 py-1.5 text-[10px] bg-neon-red/10 text-neon-red border-b border-neon-red/20">
              {yamlError}
            </div>
          )}
          <ScrollArea className="flex-1">
            {editing ? (
              <textarea
                value={editedYaml}
                onChange={(e) => setEditedYaml(e.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[400px] p-3 text-[10px] text-neon-green/80 leading-relaxed font-mono bg-transparent border-none resize-none focus:outline-none"
              />
            ) : (
              <pre className="p-3 text-[10px] text-foreground/80 leading-relaxed">
                {yaml}
              </pre>
            )}
          </ScrollArea>

          {diffData && cluster && (
            <DiffModal
              diff={diffData}
              yaml={editedYaml}
              context={cluster}
              onClose={() => setDiffData(null)}
              onApplied={() => {
                setDiffData(null);
                setEditing(false);
              }}
            />
          )}
        </TabsContent>

        {resource.kind === "Pod" && (
          <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              {logsLoading ? (
                <div className="p-3 text-xs text-neon-cyan flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                  Loading logs...
                </div>
              ) : (
                <pre className="p-3 text-[10px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {logs || "No logs available"}
                </pre>
              )}
            </ScrollArea>
          </TabsContent>
        )}

        {isElasticResource(resource) && (
          <TabsContent value="telemetry" className="flex-1 overflow-hidden mt-0">
            <TelemetryTab resource={resource} cluster={cluster} />
          </TabsContent>
        )}

        <TabsContent value="commands" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full p-3">
            <div className="space-y-2">
              {commands.map((cmd, i) => (
                <CommandCard
                  key={i}
                  command={cmd}
                  cluster={cluster}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span
        className={`text-[11px] text-right truncate ${mono ? "font-mono text-[9px]" : ""} ${color || ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function CommandCard({
  command,
  cluster,
}: {
  command: CommandSuggestion;
  cluster: string | null;
}) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ text: string; success: boolean } | null>(null);

  const execute = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.command, context: cluster }),
      });
      const data = await res.json();
      setOutput({ text: data.stdout || data.stderr || "No output", success: data.success });
    } catch {
      setOutput({ text: "Execution failed", success: false });
    } finally {
      setRunning(false);
    }
  };

  const borderColor =
    command.severity === "danger"
      ? "border-neon-red/30"
      : command.severity === "warning"
      ? "border-neon-amber/30"
      : "border-border";

  return (
    <div className={`border ${borderColor} rounded bg-card overflow-hidden`}>
      <div className="p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium">{command.label}</span>
          <button
            onClick={execute}
            disabled={running}
            className="text-neon-cyan hover:text-neon-green transition-colors disabled:opacity-40"
            title="Run command"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          </button>
        </div>
        <code className="text-[9px] text-neon-cyan/80 block truncate">{command.command}</code>
        <p className="text-[9px] text-muted-foreground mt-1">{command.description}</p>
      </div>
      {output && (
        <div className={`border-t px-2 py-1.5 max-h-[150px] overflow-y-auto ${
          output.success ? "border-neon-green/20 bg-neon-green/5" : "border-neon-red/20 bg-neon-red/5"
        }`}>
          <pre className={`text-[9px] whitespace-pre-wrap leading-relaxed ${
            output.success ? "text-foreground/80" : "text-neon-red"
          }`}>
            {output.text}
          </pre>
        </div>
      )}
    </div>
  );
}
