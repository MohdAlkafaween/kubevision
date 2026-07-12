"use client";

import { cn } from "@/lib/utils";
import {
  Activity,
  Box,
  ChevronDown,
  Cpu,
  Globe,
  Layers,
  LayoutGrid,
  Network,
  PenTool,
  Server,
  Settings,
  Terminal,
  Workflow,
} from "lucide-react";
import type { ClusterContext } from "@/types/k8s";

interface SidebarProps {
  contexts: ClusterContext[];
  activeCluster: string | null;
  onSelectCluster: (name: string) => void;
  activeView: string;
  onViewChange: (view: string) => void;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
}

const navItems = [
  { id: "topology", label: "Topology", icon: Workflow },
  { id: "planner", label: "Planner", icon: PenTool },
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "nodes", label: "Nodes", icon: Server },
  { id: "pods", label: "Pods", icon: Box },
  { id: "services", label: "Services", icon: Globe },
  { id: "deployments", label: "Deployments", icon: Layers },
  { id: "network", label: "Network", icon: Network },
  { id: "events", label: "Events", icon: Activity },
  { id: "metrics", label: "Metrics", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  contexts,
  activeCluster,
  onSelectCluster,
  activeView,
  onViewChange,
  onToggleTerminal,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-[var(--terminal-bg)] border-r border-border flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
          <span className="text-sm font-bold text-neon-green tracking-wider">
            KUBEVISION
          </span>
        </div>

        <div className="relative">
          <select
            value={activeCluster || ""}
            onChange={(e) => onSelectCluster(e.target.value)}
            className="w-full bg-[var(--terminal-header)] text-foreground text-xs border border-border rounded px-2 py-1.5 appearance-none cursor-pointer focus:outline-none focus:border-neon-cyan"
          >
            {contexts.length === 0 && (
              <option value="">No clusters found</option>
            )}
            {contexts.map((ctx) => (
              <option key={ctx.name} value={ctx.name}>
                {ctx.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 mt-2 px-2 py-1 text-[10px] text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/5 transition-colors rounded"
        >
          <Settings className="w-3 h-3" />
          Cluster Settings
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors",
                activeView === item.id
                  ? "text-neon-cyan bg-neon-cyan/10 border-r-2 border-neon-cyan"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={onToggleTerminal}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-neon-green hover:bg-neon-green/5 transition-colors rounded"
        >
          <Terminal className="w-3.5 h-3.5" />
          Terminal
        </button>
      </div>
    </aside>
  );
}
