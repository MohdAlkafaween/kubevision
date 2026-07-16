"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Pencil, Trash2, Settings } from "lucide-react";

export type DriftStatus = "matched" | "drifted" | "missing" | "unknown";

export interface DriftDetail {
  field: string;
  planned: string;
  live: string;
}

export interface NodeValidationError {
  severity: "error" | "warning";
  rule: string;
  message: string;
}

export interface PlanNodeData {
  kind: string;
  label: string;
  icon: string;
  config: Record<string, unknown>;
  notes: string;
  namespace: string;
  color: string;
  replicas?: number;
  driftStatus?: DriftStatus;
  driftDetails?: DriftDetail[];
  validationErrors?: NodeValidationError[];
  [key: string]: unknown;
}

const kindColors: Record<string, string> = {
  Node: "border-neon-cyan/60",
  Pod: "border-neon-green/60",
  Deployment: "border-neon-purple/60",
  StatefulSet: "border-neon-purple/60",
  DaemonSet: "border-neon-purple/60",
  Job: "border-neon-amber/60",
  CronJob: "border-neon-amber/60",
  Service: "border-neon-blue/60",
  Ingress: "border-neon-green/60",
  NetworkPolicy: "border-neon-red/60",
  LoadBalancer: "border-neon-blue/60",
  PersistentVolumeClaim: "border-neon-amber/60",
  PersistentVolume: "border-neon-amber/60",
  ConfigMap: "border-muted-foreground/60",
  Secret: "border-neon-red/60",
  Namespace: "border-neon-cyan/60",
  HPA: "border-neon-green/60",
};

const PlanNode = memo(function PlanNode({
  data,
  selected,
}: NodeProps & { data: PlanNodeData }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.label);
  const hasErrors = data.validationErrors && data.validationErrors.length > 0;
  const errorCount = data.validationErrors?.filter((e) => e.severity === "error").length || 0;
  const warnCount = data.validationErrors?.filter((e) => e.severity === "warning").length || 0;

  const borderClass = hasErrors && errorCount > 0
    ? "border-neon-red/80"
    : hasErrors && warnCount > 0
    ? "border-neon-amber/80"
    : data.driftStatus === "drifted"
    ? "border-neon-amber/80"
    : data.driftStatus === "missing"
    ? "border-neon-red/80"
    : data.driftStatus === "matched"
    ? "border-neon-green/80"
    : kindColors[data.kind] || "border-border";

  return (
    <div
      className={cn(
        "relative px-3 py-2.5 rounded-lg border-2 bg-card min-w-[160px] max-w-[220px] transition-all duration-200",
        borderClass,
        selected && "ring-2 ring-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]",
        hasErrors && errorCount > 0 && "shadow-[0_0_12px_rgba(255,82,82,0.25)]",
        hasErrors && errorCount === 0 && warnCount > 0 && "shadow-[0_0_10px_rgba(255,179,0,0.2)]",
        data.driftStatus === "drifted" && !hasErrors && "shadow-[0_0_10px_rgba(255,179,0,0.15)]",
        data.driftStatus === "missing" && !hasErrors && "shadow-[0_0_10px_rgba(255,82,82,0.15)]"
      )}
    >
      {hasErrors && (
        <div className="absolute -top-2 -right-2 z-10 w-4 h-4 rounded-full bg-neon-red flex items-center justify-center text-[8px] font-bold text-white shadow-[0_0_6px_rgba(255,82,82,0.5)]">
          {errorCount + warnCount}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-neon-cyan !border-none !w-2 !h-2 !-top-1"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-neon-cyan !border-none !w-2 !h-2 !-left-1"
      />

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{data.icon}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
          {data.kind}
        </span>
        {data.replicas && data.replicas > 1 && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-neon-cyan/10 text-neon-cyan rounded">
            ×{data.replicas}
          </span>
        )}
      </div>

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
          className="w-full bg-transparent text-xs font-medium text-foreground border-b border-neon-cyan/50 focus:outline-none pb-0.5"
        />
      ) : (
        <div
          className="text-xs font-medium text-foreground truncate cursor-text"
          onDoubleClick={() => setEditing(true)}
        >
          {data.label}
        </div>
      )}

      {data.driftStatus && data.driftStatus !== "unknown" && (
        <div
          className={cn(
            "text-[8px] font-semibold px-1.5 py-0.5 rounded mt-1 flex items-center gap-1",
            data.driftStatus === "matched" && "bg-neon-green/10 text-neon-green",
            data.driftStatus === "drifted" && "bg-neon-amber/10 text-neon-amber",
            data.driftStatus === "missing" && "bg-neon-red/10 text-neon-red"
          )}
          title={
            data.driftDetails?.map((d) => `${d.field}: plan=${d.planned}, live=${d.live}`).join("\n") ||
            (data.driftStatus === "missing" ? "Not found in cluster" : "")
          }
        >
          <span>
            {data.driftStatus === "matched" ? "✓" : data.driftStatus === "drifted" ? "⚠" : "✕"}
          </span>
          {data.driftStatus === "matched" && "In sync"}
          {data.driftStatus === "drifted" && `Drifted (${data.driftDetails?.length || 0})`}
          {data.driftStatus === "missing" && "Not in cluster"}
        </div>
      )}

      {hasErrors && (
        <div
          className="mt-1 space-y-0.5"
          title={data.validationErrors!.map((e) => `[${e.severity}] ${e.message}`).join("\n")}
        >
          {data.validationErrors!.map((err, i) => (
            <div
              key={i}
              className={cn(
                "text-[8px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1",
                err.severity === "error"
                  ? "bg-neon-red/10 text-neon-red"
                  : "bg-neon-amber/10 text-neon-amber"
              )}
            >
              <span>{err.severity === "error" ? "✕" : "⚠"}</span>
              <span className="truncate">{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {data.namespace && (
        <div className="text-[9px] text-muted-foreground mt-0.5">
          ns: {data.namespace}
        </div>
      )}

      {data.notes && (
        <div className="text-[9px] text-neon-amber/70 mt-1 italic line-clamp-2">
          {data.notes}
        </div>
      )}

      {Object.keys(data.config).length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50 space-y-0.5">
          {Object.entries(data.config)
            .slice(0, 3)
            .map(([key, val]) => (
              <div key={key} className="flex justify-between text-[8px]">
                <span className="text-muted-foreground">{key}</span>
                <span className="text-foreground/70 truncate ml-2 max-w-[80px]">
                  {typeof val === "object" ? JSON.stringify(val).slice(0, 20) : String(val)}
                </span>
              </div>
            ))}
        </div>
      )}

      {selected && (
        <div className="absolute -top-7 right-0 flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1 bg-card border border-border rounded hover:border-neon-cyan transition-colors"
          >
            <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
          </button>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-neon-green !border-none !w-2 !h-2 !-bottom-1"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-neon-green !border-none !w-2 !h-2 !-right-1"
      />
    </div>
  );
});

export { PlanNode };
