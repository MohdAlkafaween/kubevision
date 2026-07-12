"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { ClusterContext } from "@/types/k8s";

interface ClusterDockProps {
  contexts: ClusterContext[];
  activeCluster: string | null;
  onSelectCluster: (name: string) => void;
  onAddCluster?: () => void;
}

function clusterInitials(name: string): string {
  const parts = name.split(/[-_./]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function clusterColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = [
    "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40",
    "bg-neon-green/20 text-neon-green border-neon-green/40",
    "bg-neon-purple/20 text-neon-purple border-neon-purple/40",
    "bg-neon-amber/20 text-neon-amber border-neon-amber/40",
    "bg-neon-red/20 text-neon-red border-neon-red/40",
    "bg-blue-500/20 text-blue-400 border-blue-400/40",
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function ClusterDock({ contexts, activeCluster, onSelectCluster, onAddCluster }: ClusterDockProps) {
  return (
    <div className="w-[52px] flex-shrink-0 bg-[var(--terminal-bg)] border-r border-border flex flex-col items-center py-3 gap-2 h-full">
      <div className="w-7 h-7 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center mb-2">
        <span className="text-[10px] font-bold text-neon-cyan">K8</span>
      </div>

      <div className="w-6 h-px bg-border mb-1" />

      <div className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto scrollbar-hide">
        {contexts.map((ctx) => {
          const isActive = ctx.name === activeCluster;
          return (
            <button
              key={ctx.name}
              onClick={() => onSelectCluster(ctx.name)}
              title={ctx.name}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all relative border",
                isActive
                  ? "bg-neon-cyan/15 text-neon-cyan border-neon-cyan/50 shadow-[0_0_8px_rgba(0,229,255,0.2)]"
                  : clusterColor(ctx.name) + " hover:scale-105 opacity-60 hover:opacity-100"
              )}
            >
              {clusterInitials(ctx.name)}
              {isActive && (
                <div className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-neon-cyan" />
              )}
            </button>
          );
        })}
      </div>

      <div className="w-6 h-px bg-border mt-1" />

      <button
        onClick={onAddCluster}
        title="Add Cluster"
        className="w-9 h-9 rounded-lg border border-dashed border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/30 flex items-center justify-center transition-colors mt-1"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
