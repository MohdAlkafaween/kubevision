"use client";

import { memo, useState } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

export interface ClusterNodeData {
  kind: "Cluster";
  label: string;
  icon: string;
  config: Record<string, unknown>;
  notes: string;
  namespace: string;
  color: string;
  [key: string]: unknown;
}

const ClusterNode = memo(function ClusterNode({
  data,
  selected,
}: NodeProps & { data: ClusterNodeData }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.label);

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed transition-all duration-200 min-w-[300px] min-h-[200px] w-full h-full",
        selected
          ? "border-neon-cyan shadow-[0_0_20px_rgba(0,229,255,0.15)]"
          : "border-neon-cyan/30"
      )}
      style={{
        backgroundColor: "rgba(0, 229, 255, 0.03)",
      }}
    >
      <NodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={selected}
        lineClassName="!border-neon-cyan/40"
        handleClassName="!w-2 !h-2 !bg-neon-cyan !border-none !rounded-sm"
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-dashed border-neon-cyan/20">
        <span className="text-base">⎈</span>
        <span className="text-[9px] uppercase tracking-widest text-neon-cyan/60 font-semibold">
          Cluster
        </span>
        <span className="text-[9px] text-neon-cyan/30 mx-1">|</span>

        {editing ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              data.label = name;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                data.label = name;
              }
            }}
            autoFocus
            className="bg-transparent text-sm font-bold text-neon-cyan border-b border-neon-cyan/50 focus:outline-none"
          />
        ) : (
          <span
            className="text-sm font-bold text-neon-cyan cursor-text"
            onDoubleClick={() => setEditing(true)}
          >
            {data.label}
          </span>
        )}

        {selected && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto p-0.5 text-neon-cyan/40 hover:text-neon-cyan transition-colors"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {data.notes && (
        <div className="px-3 py-1 text-[9px] text-neon-cyan/40 italic">
          {data.notes}
        </div>
      )}
    </div>
  );
});

export { ClusterNode };
