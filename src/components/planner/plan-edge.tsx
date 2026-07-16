"use client";

import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface PlanEdgeData {
  label: string;
  connectionType: "routes-to" | "exposes" | "mounts" | "selects" | "depends-on" | "custom";
  protocol?: string;
  port?: number;
  notes?: string;
  [key: string]: unknown;
}

const edgeColors: Record<string, string> = {
  "routes-to": "#00E5FF",
  exposes: "#39FF14",
  mounts: "#FFB300",
  selects: "#7C4DFF",
  "depends-on": "#FF6E40",
  custom: "#888",
};

const PlanEdge = memo(function PlanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as PlanEdgeData | undefined;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const color = edgeColors[edgeData?.connectionType || "custom"] || "#888";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: edgeData?.connectionType === "depends-on" ? "6 3" : undefined,
          filter: selected ? `drop-shadow(0 0 4px ${color})` : undefined,
        }}
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className={`px-1.5 py-0.5 rounded text-[8px] border transition-all ${
              selected
                ? "bg-card border-neon-cyan text-neon-cyan"
                : "bg-card/90 border-border/50 text-muted-foreground"
            }`}
          >
            {edgeData.label}
            {edgeData.port && (
              <span className="ml-1 text-neon-cyan">:{edgeData.port}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export { PlanEdge };
