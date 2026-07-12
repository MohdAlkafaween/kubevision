"use client";

import { useState } from "react";
import { X, Check, Loader2, AlertTriangle } from "lucide-react";

interface DiffModalProps {
  diff: string;
  yaml: string;
  context: string;
  onClose: () => void;
  onApplied: () => void;
}

function parseDiffLine(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) return "added";
  if (line.startsWith("-") && !line.startsWith("---")) return "removed";
  if (line.startsWith("@@")) return "header";
  return "context";
}

export function DiffModal({ diff, yaml, context, onClose, onApplied }: DiffModalProps) {
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const lines = diff.split("\n");

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, context }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ success: false, message: data.error });
      } else if (data.success) {
        setResult({ success: true, message: data.stdout || "Applied successfully" });
        setTimeout(onApplied, 1500);
      } else {
        setResult({ success: false, message: data.stderr || "Apply failed" });
      }
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Apply failed" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[700px] max-h-[80vh] bg-[var(--terminal-bg)] border border-border rounded-lg flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-[var(--terminal-header)] rounded-t-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-neon-amber" />
            <span className="text-xs font-medium">Review Changes</span>
            <span className="text-[10px] text-muted-foreground">kubectl diff</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-0">
          <pre className="text-[10px] leading-relaxed font-mono">
            {lines.map((line, i) => {
              const type = parseDiffLine(line);
              return (
                <div
                  key={i}
                  className={
                    type === "added"
                      ? "bg-neon-green/10 text-neon-green px-4 py-px"
                      : type === "removed"
                      ? "bg-neon-red/10 text-neon-red px-4 py-px"
                      : type === "header"
                      ? "bg-neon-cyan/5 text-neon-cyan px-4 py-px"
                      : "text-foreground/60 px-4 py-px"
                  }
                >
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </div>

        {result && (
          <div
            className={`px-4 py-2 text-[11px] border-t ${
              result.success
                ? "bg-neon-green/10 text-neon-green border-neon-green/20"
                : "bg-neon-red/10 text-neon-red border-neon-red/20"
            }`}
          >
            {result.message}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border">
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || result?.success === true}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green hover:bg-neon-green/20 transition-colors disabled:opacity-50"
          >
            {applying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : result?.success ? (
              <Check className="w-3 h-3" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {result?.success ? "Applied!" : "Apply Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
