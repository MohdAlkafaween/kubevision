"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Plus, Trash2, FileCode, AlertCircle, AlertTriangle, Wrench } from "lucide-react";
import type { PlanNodeData } from "./plan-node";
import type { PlanEdgeData } from "./plan-edge";
import type { Node, Edge } from "@xyflow/react";
import type { ValidationError } from "@/lib/planner/validation-engine";

interface PropertyEditorProps {
  selectedNode: Node<PlanNodeData> | null;
  selectedEdge: Edge<PlanEdgeData> | null;
  onUpdateNode: (id: string, data: Partial<PlanNodeData>) => void;
  onUpdateEdge: (id: string, data: Partial<PlanEdgeData>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onClose: () => void;
  validationErrors?: ValidationError[];
  onQuickFix?: (error: ValidationError) => void;
}

const CONNECTION_TYPES: PlanEdgeData["connectionType"][] = [
  "routes-to",
  "exposes",
  "mounts",
  "selects",
  "depends-on",
  "custom",
];

export function PropertyEditor({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
  onClose,
  validationErrors,
  onQuickFix,
}: PropertyEditorProps) {
  if (!selectedNode && !selectedEdge) return null;

  const nodeErrors = selectedNode
    ? validationErrors?.filter((e) => e.nodeId === selectedNode.id) || []
    : [];

  return (
    <div className="w-64 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Properties
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {selectedNode && (
          <>
            <NodeProperties
              node={selectedNode}
              onUpdate={onUpdateNode}
              onDelete={onDeleteNode}
            />
            {nodeErrors.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  Validation Issues
                </div>
                <div className="space-y-2">
                  {nodeErrors.map((err, i) => (
                    <div
                      key={`${err.rule}-${i}`}
                      className={`p-2 rounded border ${
                        err.severity === "error"
                          ? "border-neon-red/30 bg-neon-red/5"
                          : "border-neon-amber/30 bg-neon-amber/5"
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        {err.severity === "error" ? (
                          <AlertCircle className="w-3 h-3 text-neon-red shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-neon-amber shrink-0 mt-0.5" />
                        )}
                        <span className="text-[10px] text-foreground">{err.message}</span>
                      </div>
                      {err.quickFix && onQuickFix && (
                        <button
                          onClick={() => onQuickFix(err)}
                          className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] bg-neon-cyan/5 text-neon-cyan border border-neon-cyan/20 hover:bg-neon-cyan/10 transition-colors"
                        >
                          <Wrench className="w-2.5 h-2.5" />
                          {err.quickFix.label}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {selectedEdge && (
          <EdgeProperties
            edge={selectedEdge}
            onUpdate={onUpdateEdge}
            onDelete={onDeleteEdge}
          />
        )}
      </ScrollArea>
    </div>
  );
}

function NodeProperties({
  node,
  onUpdate,
  onDelete,
}: {
  node: Node<PlanNodeData>;
  onUpdate: (id: string, data: Partial<PlanNodeData>) => void;
  onDelete: (id: string) => void;
}) {
  const data = node.data;
  const [configEntries, setConfigEntries] = useState(
    Object.entries(data.config).map(([k, v]) => ({
      key: k,
      value: typeof v === "object" ? JSON.stringify(v) : String(v),
    }))
  );

  const updateConfig = (entries: typeof configEntries) => {
    const config: Record<string, unknown> = {};
    entries.forEach(({ key, value }) => {
      if (key) {
        try {
          config[key] = JSON.parse(value);
        } catch {
          config[key] = value;
        }
      }
    });
    setConfigEntries(entries);
    onUpdate(node.id, { config });
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-lg">{data.icon}</span>
        <div>
          <div className="font-medium">{data.kind}</div>
          <div className="text-[9px] text-muted-foreground">{node.id.slice(0, 8)}</div>
        </div>
        <button
          onClick={() => onDelete(node.id)}
          className="ml-auto text-muted-foreground hover:text-neon-red transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Field label="Name">
        <Input
          value={data.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="h-6 text-xs bg-card border-border"
        />
      </Field>

      <Field label="Namespace">
        <Input
          value={data.namespace}
          onChange={(e) => onUpdate(node.id, { namespace: e.target.value })}
          placeholder="default"
          className="h-6 text-xs bg-card border-border"
        />
      </Field>

      {(data.kind === "Deployment" || data.kind === "StatefulSet" || data.kind === "ReplicaSet") && (
        <Field label="Replicas">
          <Input
            type="number"
            value={data.replicas ?? 1}
            onChange={(e) => onUpdate(node.id, { replicas: parseInt(e.target.value) || 1 })}
            min={1}
            className="h-6 text-xs bg-card border-border w-20"
          />
        </Field>
      )}

      <Field label="Notes">
        <textarea
          value={data.notes}
          onChange={(e) => onUpdate(node.id, { notes: e.target.value })}
          placeholder="Add notes..."
          rows={2}
          className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-neon-cyan resize-none"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Config</span>
          <button
            onClick={() => updateConfig([...configEntries, { key: "", value: "" }])}
            className="text-neon-cyan hover:text-neon-green transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-1.5">
          {configEntries.map((entry, i) => (
            <div key={i} className="flex gap-1">
              <Input
                value={entry.key}
                onChange={(e) => {
                  const updated = [...configEntries];
                  updated[i] = { ...updated[i], key: e.target.value };
                  updateConfig(updated);
                }}
                placeholder="key"
                className="h-5 text-[10px] bg-card border-border flex-1"
              />
              <Input
                value={entry.value}
                onChange={(e) => {
                  const updated = [...configEntries];
                  updated[i] = { ...updated[i], value: e.target.value };
                  updateConfig(updated);
                }}
                placeholder="value"
                className="h-5 text-[10px] bg-card border-border flex-1"
              />
              <button
                onClick={() => updateConfig(configEntries.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-neon-red shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EdgeProperties({
  edge,
  onUpdate,
  onDelete,
}: {
  edge: Edge<PlanEdgeData>;
  onUpdate: (id: string, data: Partial<PlanEdgeData>) => void;
  onDelete: (id: string) => void;
}) {
  const data = (edge.data || {}) as PlanEdgeData;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">Connection</span>
        <button
          onClick={() => onDelete(edge.id)}
          className="text-muted-foreground hover:text-neon-red transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Field label="Label">
        <Input
          value={data.label || ""}
          onChange={(e) => onUpdate(edge.id, { label: e.target.value })}
          placeholder="e.g. HTTP, gRPC..."
          className="h-6 text-xs bg-card border-border"
        />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-1">
          {CONNECTION_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onUpdate(edge.id, { connectionType: type })}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                data.connectionType === type
                  ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Port">
        <Input
          type="number"
          value={data.port || ""}
          onChange={(e) => onUpdate(edge.id, { port: parseInt(e.target.value) || undefined })}
          placeholder="8080"
          className="h-6 text-xs bg-card border-border w-20"
        />
      </Field>

      <Field label="Protocol">
        <Input
          value={data.protocol || ""}
          onChange={(e) => onUpdate(edge.id, { protocol: e.target.value })}
          placeholder="TCP, HTTP, gRPC..."
          className="h-6 text-xs bg-card border-border"
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={data.notes || ""}
          onChange={(e) => onUpdate(edge.id, { notes: e.target.value })}
          placeholder="Connection notes..."
          rows={2}
          className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-neon-cyan resize-none"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      {children}
    </div>
  );
}
