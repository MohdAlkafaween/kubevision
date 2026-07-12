"use client";

import { X, AlertTriangle, AlertCircle, Wrench } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ValidationError } from "@/lib/planner/validation-engine";

interface ValidationPanelProps {
  errors: ValidationError[];
  onClose: () => void;
  onQuickFix: (error: ValidationError) => void;
  onFocusNode: (nodeId: string) => void;
}

export function ValidationPanel({
  errors,
  onClose,
  onQuickFix,
  onFocusNode,
}: ValidationPanelProps) {
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warning").length;

  return (
    <div className="w-80 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-neon-amber" />
          <span className="text-xs font-medium">Validation Report</span>
          <div className="flex items-center gap-1.5 ml-1">
            {errorCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-red/10 text-neon-red font-semibold">
                {errorCount} error{errorCount !== 1 ? "s" : ""}
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-amber/10 text-neon-amber font-semibold">
                {warnCount} warning{warnCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {errors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-8 h-8 rounded-full bg-neon-green/10 border border-neon-green/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-neon-green text-sm">✓</span>
              </div>
              <p className="text-[11px] text-muted-foreground">No issues detected</p>
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                Your architecture looks valid
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {errors.map((err, i) => (
              <div
                key={`${err.nodeId}-${err.rule}-${i}`}
                className="border border-border rounded p-2 hover:border-neon-cyan/30 hover:bg-accent/10 transition-colors"
              >
                <div className="flex items-start gap-1.5">
                  {err.severity === "error" ? (
                    <AlertCircle className="w-3 h-3 text-neon-red shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-neon-amber shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onFocusNode(err.nodeId)}
                      className="text-[10px] text-foreground hover:text-neon-cyan transition-colors text-left"
                    >
                      {err.message}
                    </button>
                    <div className="text-[8px] text-muted-foreground/60 mt-0.5">
                      {err.rule}
                    </div>
                  </div>
                </div>

                {err.quickFix && (
                  <button
                    onClick={() => onQuickFix(err)}
                    className="mt-1.5 w-full flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-neon-cyan/5 text-neon-cyan border border-neon-cyan/20 hover:bg-neon-cyan/10 transition-colors"
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    {err.quickFix.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
