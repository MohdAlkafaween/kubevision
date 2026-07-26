"use client";

import { useState, useCallback, useMemo } from "react";
import { Bot, Sparkles } from "lucide-react";
import { ClusterDock } from "@/components/layout/cluster-dock";
import { ResourceTree } from "@/components/layout/resource-tree";
import { Header } from "@/components/layout/header";
import { TerminalPanel } from "@/components/layout/terminal-panel";
import { TopologyCanvas } from "@/components/topology/topology-canvas";
import { ResourceDetail } from "@/components/panels/resource-detail";
import { AiPanel } from "@/components/panels/ai-panel";
import { ClusterOverview } from "@/components/dashboard/cluster-overview";
import { EventTimeline } from "@/components/panels/event-timeline";
import { ResourceList } from "@/components/dashboard/resource-list";
import { ResourceHeatmap } from "@/components/dashboard/resource-heatmap";
import { PlanningCanvas } from "@/components/planner/planning-canvas";
import { ClusterSettings } from "@/components/panels/cluster-settings";
import { SettingsPage } from "@/components/settings/settings-page";
import { SecurityPosture } from "@/components/dashboard/security-posture";
import { SnapshotDiff } from "@/components/dashboard/snapshot-diff";
import { HelmReleases } from "@/components/dashboard/helm-releases";
import { CrdBrowser } from "@/components/dashboard/crd-browser";
import { AuditLog } from "@/components/dashboard/audit-log";
import { ClusterCompare } from "@/components/dashboard/cluster-compare";
import { HpaViewer } from "@/components/dashboard/hpa-viewer";
import { PdbViewer } from "@/components/dashboard/pdb-viewer";
import { QuotaViewer } from "@/components/dashboard/quota-viewer";
import { RbacViewer } from "@/components/dashboard/rbac-viewer";
import { LiveLogStream } from "@/components/dashboard/live-log-stream";
import { ConfigWorkspace } from "@/components/config-editor/config-workspace";
import { useClusters, useResources, useResourceStream } from "@/hooks/use-cluster";
import { useMetrics } from "@/hooks/use-metrics";
import { useNotifications } from "@/hooks/use-notifications";
import { usePrometheus } from "@/hooks/use-prometheus";
import { useTraffic } from "@/hooks/use-traffic";
import {
  harvestDashboardContext,
  harvestResourceContext,
} from "@/lib/ai/context-harvester";
import type { K8sResource } from "@/types/k8s";

const RESOURCE_LIST_VIEWS = [
  "nodes", "pods", "services", "deployments", "network",
  "statefulsets", "daemonsets", "jobs", "cronjobs",
  "pvcs", "pvs", "configmaps", "secrets", "namespaces",
  "networkpolicies",
];

const VIEW_TO_RESOURCE_TYPE: Record<string, string> = {
  nodes: "nodes",
  pods: "pods",
  services: "services",
  deployments: "deployments",
  network: "network",
  statefulsets: "statefulsets",
  daemonsets: "daemonsets",
  jobs: "jobs",
  cronjobs: "cronjobs",
  pvcs: "pvcs",
  pvs: "pvs",
  configmaps: "configmaps",
  secrets: "secrets",
  namespaces: "namespaces",
  networkpolicies: "networkpolicies",
};

export default function Home() {
  const { contexts, activeCluster, setActiveCluster, loading: clustersLoading } = useClusters();
  const { resources, loading: resourcesLoading, error: resourcesError, refetch } = useResources(activeCluster);
  const events = useResourceStream(activeCluster);
  const { metrics: metricsHistory } = useMetrics(activeCluster);
  const { traffic: prometheusTraffic } = usePrometheus(activeCluster);
  const trafficSnapshot = useTraffic(activeCluster);
  const {
    notifications,
    unreadCount,
    permissionGranted: notifPermission,
    requestPermission: requestNotifPermission,
    markAllRead,
    clearAll: clearNotifications,
  } = useNotifications(events);

  const [activeView, setActiveView] = useState("topology");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [selectedResource, setSelectedResource] = useState<K8sResource | null>(null);
  const [namespaceFilter, setNamespaceFilter] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const handleNodeClick = useCallback((resource: K8sResource) => {
    setSelectedResource(resource);
    setSettingsOpen(false);
    setAiPanelOpen(false);
  }, []);

  const handleRunCommand = useCallback((_command: string) => {
    setTerminalOpen(true);
  }, []);

  const handleExecPod = useCallback((podName: string, namespace: string, container?: string) => {
    const containerFlag = container ? ` -c ${container}` : "";
    handleRunCommand(`kubectl exec -it ${podName} -n ${namespace}${containerFlag} -- /bin/sh`);
  }, [handleRunCommand]);

  const handleResourceSelect = useCallback((resource: K8sResource) => {
    setSelectedResource(resource);
    setSettingsOpen(false);
    setAiPanelOpen(false);
  }, []);

  const handleNavigateDependency = useCallback((kind: string, name: string, namespace?: string) => {
    if (!resources) return;
    const kindToKey: Record<string, keyof typeof resources> = {
      Pod: "pods",
      Deployment: "deployments",
      StatefulSet: "statefulSets",
      DaemonSet: "daemonSets",
      Service: "services",
      ConfigMap: "configMaps",
      Secret: "secrets",
      PVC: "pvcs",
      PersistentVolumeClaim: "pvcs",
      PersistentVolume: "pvs",
      Node: "nodes",
      Ingress: "ingresses",
      Job: "jobs",
      CronJob: "cronJobs",
      Namespace: "namespaces",
      NetworkPolicy: "networkPolicies",
      ServiceAccount: "pods",
    };
    const key = kindToKey[kind];
    if (!key) return;
    const list = resources[key] as K8sResource[];
    const match = list.find((r) =>
      r.name === name && (!namespace || !r.namespace || r.namespace === namespace)
    );
    if (match) {
      setSelectedResource(match);
    }
  }, [resources]);

  const handleViewChange = useCallback((view: string) => {
    setActiveView(view);
    setSelectedResource(null);
    setAiPanelOpen(false);
    if (view === "settings") {
      setSettingsOpen(true);
    } else {
      setSettingsOpen(false);
    }
  }, []);

  const namespaces = resources
    ? [...new Set(resources.pods.map((p) => p.namespace).filter(Boolean))]
    : [];

  const showDetailPanel = selectedResource && activeView !== "planner" && !settingsOpen && !aiPanelOpen;
  const showSettingsPanel = settingsOpen && activeCluster && activeView !== "planner" && !aiPanelOpen;
  const isResourceListView = RESOURCE_LIST_VIEWS.includes(activeView);

  const aiContext = useMemo(() => {
    if (selectedResource) {
      return harvestResourceContext(selectedResource);
    }
    return harvestDashboardContext(resources, events, activeCluster);
  }, [resources, events, activeCluster, selectedResource]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Cluster Icon Dock */}
      <ClusterDock
        contexts={contexts}
        activeCluster={activeCluster}
        onSelectCluster={setActiveCluster}
        onAddCluster={() => handleViewChange("settings")}
      />

      {/* Resource Tree Sidebar */}
      <ResourceTree
        activeView={activeView}
        onViewChange={handleViewChange}
        onToggleTerminal={() => setTerminalOpen((o) => !o)}
        resources={resources}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {activeView !== "planner" && (
          <Header
            cluster={activeCluster}
            resources={resources}
            loading={resourcesLoading || clustersLoading}
            error={resourcesError}
            onRefresh={refetch}
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onClearNotifications={clearNotifications}
            onRequestNotificationPermission={requestNotifPermission}
            notificationPermissionGranted={notifPermission}
          />
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            {activeView === "topology" && (
              <div className="flex-1 relative">
                {resourcesLoading && !resources && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                        <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse [animation-delay:0.4s]" />
                      </div>
                      <p className="text-xs text-muted-foreground">Connecting to cluster...</p>
                    </div>
                  </div>
                )}
                {resourcesError && !resources && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center max-w-sm">
                      <div className="w-8 h-8 rounded-full bg-neon-red/10 border border-neon-red/30 flex items-center justify-center mx-auto mb-3">
                        <span className="text-neon-red text-sm">!</span>
                      </div>
                      <p className="text-sm text-foreground mb-1">Connection Failed</p>
                      <p className="text-[11px] text-muted-foreground mb-3">{resourcesError}</p>
                      <button
                        onClick={refetch}
                        className="text-[11px] px-3 py-1 rounded border border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {namespaces.length > 0 && (
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 flex-wrap max-w-[75%]">
                    <button
                      onClick={() => setNamespaceFilter([])}
                      title="Show all namespaces"
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        namespaceFilter.length === 0
                          ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All
                    </button>
                    {namespaces.map((ns) => {
                      if (!ns) return null;
                      const active = namespaceFilter.includes(ns);
                      return (
                        <button
                          key={ns}
                          onClick={() =>
                            setNamespaceFilter((prev) =>
                              prev.includes(ns) ? prev.filter((n) => n !== ns) : [...prev, ns]
                            )
                          }
                          title={active ? `Remove ${ns} from filter` : `Add ${ns} to filter`}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            active
                              ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {ns}
                        </button>
                      );
                    })}
                  </div>
                )}
                <TopologyCanvas
                  resources={resources}
                  namespaceFilter={namespaceFilter}
                  onNodeClick={handleNodeClick}
                  metricsHistory={metricsHistory}
                  prometheusTraffic={prometheusTraffic}
                  trafficSnapshot={trafficSnapshot}
                  cluster={activeCluster}
                />
              </div>
            )}

            {activeView === "planner" && <PlanningCanvas cluster={activeCluster} />}

            {activeView === "config-studio" && <ConfigWorkspace />}

            {activeView === "overview" && (
              <ClusterOverview resources={resources} cluster={activeCluster} />
            )}

            {activeView === "events" && <EventTimeline events={events} />}

            {activeView === "metrics" && (
              <ResourceHeatmap resources={resources} onSelect={handleResourceSelect} />
            )}

            {activeView === "security" && (
              <SecurityPosture cluster={activeCluster} />
            )}

            {activeView === "snapshots" && (
              <SnapshotDiff cluster={activeCluster} />
            )}

            {activeView === "helm" && (
              <HelmReleases cluster={activeCluster} />
            )}

            {activeView === "crds" && <CrdBrowser cluster={activeCluster} />}

            {activeView === "hpa" && <HpaViewer cluster={activeCluster} />}

            {activeView === "pdb" && <PdbViewer cluster={activeCluster} />}

            {activeView === "quotas" && <QuotaViewer cluster={activeCluster} />}

            {activeView === "rbac" && <RbacViewer cluster={activeCluster} />}

            {activeView === "logs" && <LiveLogStream cluster={activeCluster} />}

            {activeView === "audit" && <AuditLog cluster={activeCluster} />}

            {activeView === "compare" && <ClusterCompare />}

            {activeView === "settings" && <SettingsPage />}

            {isResourceListView && (
              <ResourceList
                resources={resources}
                resourceType={VIEW_TO_RESOURCE_TYPE[activeView] || activeView}
                onSelect={handleResourceSelect}
                metricsHistory={metricsHistory}
              />
            )}
          </div>

          {showDetailPanel && (
            <ResourceDetail
              resource={selectedResource}
              cluster={activeCluster}
              onClose={() => setSelectedResource(null)}
              onRunCommand={handleRunCommand}
              onRefresh={refetch}
              onExecPod={handleExecPod}
              onNavigateDependency={handleNavigateDependency}
            />
          )}

          {showSettingsPanel && (
            <ClusterSettings
              cluster={activeCluster!}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          <div style={{ display: aiPanelOpen ? undefined : "none" }} className="flex h-full">
            <AiPanel
              systemPrompt={aiContext.systemPrompt}
              contextSummary={aiContext.contextSummary}
              onClose={() => setAiPanelOpen(false)}
            />
          </div>
        </div>

        <TerminalPanel
          isOpen={terminalOpen && activeView !== "planner"}
          onClose={() => setTerminalOpen(false)}
          cluster={activeCluster}
          height={terminalHeight}
          onHeightChange={setTerminalHeight}
        />
      </div>

      {/* AI Toggle Button */}
      <button
        onClick={() => {
          setAiPanelOpen((o) => {
            if (!o) {
              setSelectedResource(null);
              setSettingsOpen(false);
            }
            return !o;
          });
        }}
        className={`fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all z-50 ${
          aiPanelOpen
            ? "bg-neon-purple/20 border border-neon-purple/50 text-neon-purple"
            : "bg-card border border-border text-muted-foreground hover:text-neon-purple hover:border-neon-purple/30"
        }`}
        title="AI Assistant"
      >
        <div className="relative">
          <Bot className="w-5 h-5" />
          <Sparkles className="w-2.5 h-2.5 text-neon-amber absolute -top-1 -right-1" />
        </div>
      </button>
    </div>
  );
}
