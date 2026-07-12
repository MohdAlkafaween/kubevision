"use client";

import { useMemo } from "react";
import { analyzeDependencies, type DependencyNode, type DependencyEdge } from "@/lib/k8s/dependency-analyzer";
import type { K8sResource } from "@/types/k8s";

interface DependencyGraphProps {
  resource: K8sResource;
  onNavigate?: (kind: string, name: string, namespace?: string) => void;
}

const kindColors: Record<string, { bg: string; border: string; text: string }> = {
  Pod: { bg: "#00e5ff15", border: "#00e5ff", text: "#00e5ff" },
  Deployment: { bg: "#b388ff15", border: "#b388ff", text: "#b388ff" },
  StatefulSet: { bg: "#b388ff15", border: "#b388ff", text: "#b388ff" },
  DaemonSet: { bg: "#b388ff15", border: "#b388ff", text: "#b388ff" },
  Service: { bg: "#39ff1415", border: "#39ff14", text: "#39ff14" },
  ConfigMap: { bg: "#ffb30015", border: "#ffb300", text: "#ffb300" },
  Secret: { bg: "#ff172415", border: "#ff1724", text: "#ff1724" },
  PVC: { bg: "#64ffda15", border: "#64ffda", text: "#64ffda" },
  ServiceAccount: { bg: "#e040fb15", border: "#e040fb", text: "#e040fb" },
  Job: { bg: "#ffb30015", border: "#ffb300", text: "#ffb300" },
  CronJob: { bg: "#ffb30015", border: "#ffb300", text: "#ffb300" },
};

const defaultColor = { bg: "#ffffff10", border: "#888", text: "#888" };

interface LayoutNode extends DependencyNode {
  x: number;
  y: number;
}

function layoutGraph(nodes: DependencyNode[], edges: DependencyEdge[]): { nodes: LayoutNode[]; width: number; height: number } {
  if (nodes.length === 0) return { nodes: [], width: 0, height: 0 };

  const rootNode = nodes.find((n) => n.relation === "self");
  if (!rootNode) return { nodes: nodes.map((n) => ({ ...n, x: 0, y: 0 })), width: 100, height: 100 };

  const nodeW = 120;
  const nodeH = 40;
  const gapX = 30;
  const gapY = 50;

  const deps = nodes.filter((n) => n.relation !== "self");
  const cols = Math.max(Math.ceil(Math.sqrt(deps.length)), 1);

  const totalW = cols * (nodeW + gapX) - gapX;
  const rootX = totalW / 2 - nodeW / 2;

  const layoutNodes: LayoutNode[] = [{ ...rootNode, x: rootX, y: 0 }];

  deps.forEach((dep, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layoutNodes.push({
      ...dep,
      x: col * (nodeW + gapX),
      y: (row + 1) * (nodeH + gapY),
    });
  });

  const maxY = Math.max(...layoutNodes.map((n) => n.y));
  return { nodes: layoutNodes, width: totalW + nodeW, height: maxY + nodeH };
}

export function DependencyGraph({ resource, onNavigate }: DependencyGraphProps) {
  const graph = useMemo(() => analyzeDependencies(resource), [resource]);
  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);

  if (graph.nodes.length <= 1) {
    return (
      <div className="text-[10px] text-muted-foreground/50 py-2 text-center">
        No dependencies detected
      </div>
    );
  }

  const nodeW = 120;
  const nodeH = 40;
  const padX = 16;
  const padY = 16;
  const svgW = layout.width + padX * 2;
  const svgH = layout.height + padY * 2;

  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
        Dependencies
      </div>
      <div className="overflow-x-auto rounded border border-border/50 bg-card/50">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="block">
          <defs>
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
            </marker>
          </defs>

          {graph.edges.map((edge, i) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            const x1 = padX + src.x + nodeW / 2;
            const y1 = padY + src.y + nodeH;
            const x2 = padX + tgt.x + nodeW / 2;
            const y2 = padY + tgt.y;
            const midY = (y1 + y2) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#444"
                  strokeWidth={1}
                  markerEnd="url(#dep-arrow)"
                />
                <text x={(x1 + x2) / 2} y={midY - 4} textAnchor="middle" fontSize={8} fill="#666">
                  {edge.label}
                </text>
              </g>
            );
          })}

          {layout.nodes.map((node) => {
            const colors = kindColors[node.kind] || defaultColor;
            const isClickable = node.relation !== "self" && onNavigate && !node.name.startsWith("(");
            return (
              <g
                key={node.id}
                style={{ cursor: isClickable ? "pointer" : "default" }}
                onClick={isClickable ? () => onNavigate(node.kind, node.name, node.namespace) : undefined}
              >
                <rect
                  x={padX + node.x}
                  y={padY + node.y}
                  width={nodeW}
                  height={nodeH}
                  rx={4}
                  fill={colors.bg}
                  stroke={colors.border}
                  strokeWidth={node.relation === "self" ? 1.5 : 0.8}
                />
                {isClickable && (
                  <rect
                    x={padX + node.x}
                    y={padY + node.y}
                    width={nodeW}
                    height={nodeH}
                    rx={4}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={6}
                    className="hover:stroke-[#ffffff20]"
                  />
                )}
                <text
                  x={padX + node.x + nodeW / 2}
                  y={padY + node.y + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fill={colors.text}
                  fontFamily="monospace"
                >
                  {node.kind}
                </text>
                <text
                  x={padX + node.x + nodeW / 2}
                  y={padY + node.y + 28}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isClickable ? "#8cf" : "#ccc"}
                  fontFamily="monospace"
                  textDecoration={isClickable ? "underline" : "none"}
                >
                  {node.name.length > 16 ? node.name.substring(0, 14) + "…" : node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
