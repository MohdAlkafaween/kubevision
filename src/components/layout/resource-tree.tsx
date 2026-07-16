"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Activity,
  Box,
  ChevronRight,
  Cpu,
  Globe,
  Key,
  Layers,
  LayoutGrid,
  Network,
  PenTool,
  Server,
  Settings,
  Shield,
  Terminal,
  Workflow,
  HardDrive,
  Database,
  FileText,
  FolderOpen,
  Timer,
  Clock,
  BarChart3,
  Scale,
  Package,
  Puzzle,
  ScrollText,
  Gauge,
  Users,
  Zap,
  FileCode,
} from "lucide-react";
import type { ClusterResources } from "@/types/k8s";

interface ResourceTreeProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onToggleTerminal: () => void;
  resources: ClusterResources | null;
}

interface TreeSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: TreeItem[];
}

interface TreeItem {
  id: string;
  label: string;
  icon: React.ElementType;
  countKey?: keyof ClusterResources;
}

const SPECIAL_VIEWS: TreeItem[] = [
  { id: "topology", label: "Cluster", icon: Workflow },
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "config-studio", label: "Config Studio", icon: FileCode },
  { id: "planner", label: "Planner", icon: PenTool },
  { id: "compare", label: "Compare", icon: Scale },
];

const TREE_SECTIONS: TreeSection[] = [
  {
    id: "workloads",
    label: "Workloads",
    icon: Layers,
    items: [
      { id: "deployments", label: "Deployments", icon: Layers, countKey: "deployments" },
      { id: "pods", label: "Pods", icon: Box, countKey: "pods" },
      { id: "statefulsets", label: "StatefulSets", icon: Database, countKey: "statefulSets" },
      { id: "daemonsets", label: "DaemonSets", icon: Server, countKey: "daemonSets" },
      { id: "jobs", label: "Jobs", icon: Timer, countKey: "jobs" },
      { id: "cronjobs", label: "CronJobs", icon: Clock, countKey: "cronJobs" },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: Network,
    items: [
      { id: "services", label: "Services", icon: Globe, countKey: "services" },
      { id: "network", label: "Ingresses", icon: Network, countKey: "ingresses" },
      { id: "networkpolicies", label: "Network Policies", icon: Shield, countKey: "networkPolicies" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    items: [
      { id: "pvcs", label: "Persistent Volume Claims", icon: HardDrive, countKey: "pvcs" },
      { id: "pvs", label: "Persistent Volumes", icon: Database, countKey: "pvs" },
    ],
  },
  {
    id: "config",
    label: "Config",
    icon: FileText,
    items: [
      { id: "configmaps", label: "ConfigMaps", icon: FileText, countKey: "configMaps" },
      { id: "secrets", label: "Secrets", icon: Key, countKey: "secrets" },
      { id: "namespaces", label: "Namespaces", icon: FolderOpen, countKey: "namespaces" },
    ],
  },
];

const BOTTOM_VIEWS: TreeItem[] = [
  { id: "nodes", label: "Nodes", icon: Server },
  { id: "events", label: "Events", icon: Activity },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "hpa", label: "Autoscalers", icon: Zap },
  { id: "pdb", label: "PDB", icon: Shield },
  { id: "quotas", label: "Quotas", icon: Gauge },
  { id: "rbac", label: "RBAC", icon: Users },
  { id: "helm", label: "Helm", icon: Package },
  { id: "crds", label: "CRDs", icon: Puzzle },
  { id: "logs", label: "Log Stream", icon: FileCode },
  { id: "security", label: "Security", icon: Shield },
  { id: "snapshots", label: "Snapshots", icon: Clock },
  { id: "audit", label: "Audit", icon: ScrollText },
];

export function ResourceTree({ activeView, onViewChange, onToggleTerminal, resources }: ResourceTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    workloads: true,
    network: true,
    storage: false,
    config: false,
  });

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getCount = (key?: keyof ClusterResources): number | null => {
    if (!key || !resources) return null;
    const arr = resources[key];
    return Array.isArray(arr) ? arr.length : null;
  };

  const sectionCount = (section: TreeSection): number => {
    if (!resources) return 0;
    return section.items.reduce((sum, item) => sum + (getCount(item.countKey) ?? 0), 0);
  };

  return (
    <div className="w-[210px] flex-shrink-0 bg-[var(--terminal-bg)] border-r border-border flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Resources
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {/* Special views */}
        <div className="mb-1">
          {SPECIAL_VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-[6px] text-[11px] transition-colors",
                  activeView === item.id
                    ? "text-neon-cyan bg-neon-cyan/8 border-r-2 border-neon-cyan"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-border mx-3 my-1.5" />

        {/* Collapsible resource sections */}
        {TREE_SECTIONS.map((section) => {
          const isExpanded = expanded[section.id];
          const Icon = section.icon;
          const total = sectionCount(section);

          return (
            <div key={section.id} className="mb-0.5">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-1.5 px-2 py-[5px] text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 transition-transform flex-shrink-0",
                    isExpanded && "rotate-90"
                  )}
                />
                <Icon className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                {total > 0 && (
                  <span className="text-[9px] text-muted-foreground/60 font-mono tabular-nums">
                    {total}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="ml-2">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    const count = getCount(item.countKey);
                    const isActive = activeView === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2 pl-5 pr-3 py-[5px] text-[11px] transition-colors",
                          isActive
                            ? "text-neon-cyan bg-neon-cyan/8 border-r-2 border-neon-cyan"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                        )}
                      >
                        <ItemIcon className="w-3 h-3 flex-shrink-0 opacity-70" />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {count !== null && (
                          <span
                            className={cn(
                              "text-[9px] font-mono tabular-nums",
                              isActive ? "text-neon-cyan/70" : "text-muted-foreground/50"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="h-px bg-border mx-3 my-1.5" />

        {/* Bottom views */}
        {BOTTOM_VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-[6px] text-[11px] transition-colors",
                activeView === item.id
                  ? "text-neon-cyan bg-neon-cyan/8 border-r-2 border-neon-cyan"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              )}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border p-1.5 flex gap-1">
        <button
          onClick={onToggleTerminal}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground hover:text-neon-green hover:bg-neon-green/5 transition-colors rounded"
        >
          <Terminal className="w-3 h-3" />
          Terminal
        </button>
        <button
          onClick={() => onViewChange("settings")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] transition-colors rounded",
            activeView === "settings"
              ? "text-neon-cyan bg-neon-cyan/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
          )}
        >
          <Settings className="w-3 h-3" />
          Settings
        </button>
      </div>
    </div>
  );
}
