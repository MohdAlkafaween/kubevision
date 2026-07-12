"use client";

import { useMemo, useState } from "react";
import { X, Copy, Check, Download, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Node, Edge } from "@xyflow/react";
import type { PlanNodeData } from "./plan-node";
import type { PlanEdgeData } from "./plan-edge";
import { buildPlaybookSteps } from "@/lib/planner/dependency-engine";
import { renderPlaybook } from "@/lib/planner/playbook-renderer";

interface PlaybookPanelProps {
  nodes: Node<PlanNodeData>[];
  edges: Edge<PlanEdgeData>[];
  planName: string;
  onClose: () => void;
}

export function PlaybookPanel({ nodes, edges, planName, onClose }: PlaybookPanelProps) {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const playbook = useMemo(() => {
    const steps = buildPlaybookSteps(nodes, edges);
    return renderPlaybook(steps);
  }, [nodes, edges]);

  const codeBlocks = useMemo(() => {
    const blocks: string[] = [];
    const regex = /```bash\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(playbook)) !== null) {
      blocks.push(match[1].trim());
    }
    return blocks;
  }, [playbook]);

  const copyBlock = (index: number) => {
    navigator.clipboard.writeText(codeBlocks[index]);
    setCopiedBlock(index);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(playbook);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadPlaybook = () => {
    const blob = new Blob([playbook], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${planName.toLowerCase().replace(/\s+/g, "-")}-playbook.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderMarkdown = () => {
    const sections = playbook.split(/^(## .+)$/m);
    const elements: React.ReactNode[] = [];
    let blockIndex = 0;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      if (section.startsWith("# Installation Playbook")) {
        elements.push(
          <h1 key="title" className="text-sm font-bold text-neon-cyan mb-1">
            Installation Playbook
          </h1>
        );
        continue;
      }

      if (section.startsWith("## ")) {
        elements.push(
          <h2 key={`h2-${i}`} className="text-xs font-semibold text-neon-green mt-4 mb-2">
            {section.replace("## ", "")}
          </h2>
        );
        continue;
      }

      if (section.startsWith("> ")) {
        const lines = section.split("\n").filter((l) => l.startsWith("> "));
        elements.push(
          <div key={`quote-${i}`} className="text-[9px] text-muted-foreground mb-2 pl-2 border-l-2 border-border">
            {lines.map((l, j) => (
              <div key={j}>{l.replace(/^>\s*/, "")}</div>
            ))}
          </div>
        );
        continue;
      }

      if (section.includes("```bash")) {
        const codeRegex = /```bash\n([\s\S]*?)```/g;
        let codeMatch;
        while ((codeMatch = codeRegex.exec(section)) !== null) {
          const currentIndex = blockIndex;
          elements.push(
            <div key={`code-${currentIndex}`} className="relative group mb-2">
              <pre className="text-[10px] bg-black/30 border border-border rounded p-2 overflow-x-auto text-neon-green/80 leading-relaxed">
                {codeMatch[1].trim()}
              </pre>
              <button
                onClick={() => copyBlock(currentIndex)}
                className="absolute top-1 right-1 p-1 rounded bg-card/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy"
              >
                {copiedBlock === currentIndex ? (
                  <Check className="w-3 h-3 text-neon-green" />
                ) : (
                  <Copy className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            </div>
          );
          blockIndex++;
        }
        continue;
      }

      if (section.trim() === "---") {
        elements.push(<hr key={`hr-${i}`} className="border-border my-2" />);
        continue;
      }

      if (section.trim()) {
        elements.push(
          <p key={`p-${i}`} className="text-[10px] text-muted-foreground mb-1">
            {section.trim()}
          </p>
        );
      }
    }

    return elements;
  };

  return (
    <div className="w-80 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-xs font-medium">Playbook</span>
          <span className="text-[9px] text-muted-foreground">
            {nodes.length} resources
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyAll}
            className="text-muted-foreground hover:text-neon-cyan transition-colors p-0.5"
            title="Copy all"
          >
            {copiedAll ? (
              <Check className="w-3 h-3 text-neon-green" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={downloadPlaybook}
            className="text-muted-foreground hover:text-neon-cyan transition-colors p-0.5"
            title="Download"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-xs text-muted-foreground mb-1">No resources on canvas</p>
              <p className="text-[10px] text-muted-foreground/60">
                Add resources to the planner to generate an installation playbook
              </p>
            </div>
          ) : (
            renderMarkdown()
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
