"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BaseNode } from "./nodes/base-node";
import { TrafficEdge } from "./edges/traffic-edge";
import { computeElkLayout } from "./elk-layout";
import { RotateCcw, Lock, Unlock } from "lucide-react";
import type { ClusterResources, K8sResource } from "@/types/k8s";
import type { TopologyNode, TopologyEdge, TopologyNodeData } from "@/types/topology";
import type { MetricsHistory } from "@/hooks/use-metrics";
import type { ServiceTraffic } from "@/types/metrics";
import type { TrafficSnapshot, PodActivity } from "@/hooks/use-traffic";
import { buildTopologyGraph } from "@/lib/topology/builder";

const nodeTypes: NodeTypes = {
  "k8s-node": BaseNode,
  "k8s-pod": BaseNode,
  "k8s-deployment": BaseNode,
  "k8s-replicaset": BaseNode,
  "k8s-statefulset": BaseNode,
  "k8s-daemonset": BaseNode,
  "k8s-service": BaseNode,
  "k8s-ingress": BaseNode,
  "k8s-persistentvolumeclaim": BaseNode,
  "k8s-persistentvolume": BaseNode,
  "k8s-configmap": BaseNode,
  "k8s-secret": BaseNode,
  "k8s-job": BaseNode,
  "k8s-cronjob": BaseNode,
  "k8s-namespace": BaseNode,
};

const edgeTypes: EdgeTypes = {
  traffic: TrafficEdge,
};

function getStorageKey(cluster: string | undefined, ns: string[] | undefined) {
  const nsKey = ns && ns.length > 0 ? [...ns].sort().join(",") : "all";
  return `kv-topology-${cluster || "none"}-${nsKey}`;
}

interface SavedLayout {
  positions: Record<string, { x: number; y: number }>;
  viewport?: Viewport;
  savedAt: number;
}

function saveLayout(key: string, nodes: TopologyNode[], viewport?: Viewport) {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    positions[n.id] = { x: n.position.x, y: n.position.y };
  }
  const layout: SavedLayout = { positions, viewport, savedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {}
}

function loadLayout(key: string): SavedLayout | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SavedLayout;
  } catch {
    return null;
  }
}

interface TopologyCanvasProps {
  resources: ClusterResources | null;
  namespaceFilter?: string[];
  onNodeClick?: (resource: K8sResource) => void;
  metricsHistory?: MetricsHistory;
  prometheusTraffic?: ServiceTraffic[];
  trafficSnapshot?: TrafficSnapshot | null;
  cluster?: string | null;
}

function TopologyCanvasInner({
  resources,
  namespaceFilter,
  onNodeClick,
  metricsHistory,
  prometheusTraffic,
  trafficSnapshot,
  cluster,
}: TopologyCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>([]);
  const [layoutComputed, setLayoutComputed] = useState(false);
  const [layoutLocked, setLayoutLocked] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef<TopologyNode[]>([]);
  const storageKey = getStorageKey(cluster ?? undefined, namespaceFilter);
  const { getViewport, setViewport } = useReactFlow();
  const initialFitDone = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const graph = useMemo(() => {
    if (!resources) return { nodes: [], edges: [] };
    return buildTopologyGraph(resources, namespaceFilter);
  }, [resources, namespaceFilter]);

  useEffect(() => {
    if (graph.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      setLayoutComputed(true);
      return;
    }

    const saved = loadLayout(storageKey);

    if (saved && Object.keys(saved.positions).length > 0) {
      const positioned = graph.nodes.map((n) => {
        const pos = saved.positions[n.id];
        return pos ? { ...n, position: pos } : n;
      });

      const hasNewNodes = graph.nodes.some((n) => !saved.positions[n.id]);

      if (hasNewNodes) {
        const newNodes = positioned.filter((n) => !saved.positions[n.id]);
        const savedNodes = positioned.filter((n) => saved.positions[n.id]);

        computeElkLayout(newNodes, []).then((layoutNew) => {
          const maxX = Math.max(0, ...savedNodes.map((n) => n.position.x));
          const offset = maxX + 200;
          const allNodes = [
            ...savedNodes,
            ...layoutNew.map((n) => ({
              ...n,
              position: { x: n.position.x + offset, y: n.position.y },
            })),
          ];
          setNodes(allNodes);
          setEdges(graph.edges);
          setLayoutComputed(true);
          if (saved.viewport) {
            setTimeout(() => setViewport(saved.viewport!), 50);
          }
        });
      } else {
        setNodes(positioned);
        setEdges(graph.edges);
        setLayoutComputed(true);
        if (saved.viewport) {
          setTimeout(() => setViewport(saved.viewport!), 50);
          initialFitDone.current = true;
        }
      }
    } else {
      setLayoutComputed(false);
      computeElkLayout(graph.nodes, graph.edges).then((layoutNodes) => {
        setNodes(layoutNodes);
        setEdges(graph.edges);
        setLayoutComputed(true);
        initialFitDone.current = false;
      });
    }
  }, [graph, setNodes, setEdges, storageKey, setViewport]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const vp = getViewport();
      saveLayout(storageKey, nodesRef.current, vp);
    }, 500);
  }, [storageKey, getViewport]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const hasDrag = changes.some((c) => c.type === "position" && (c as { dragging?: boolean }).dragging === false);
      if (hasDrag) {
        debouncedSave();
      }
    },
    [onNodesChange, debouncedSave]
  );

  const handleMoveEnd = useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);

  const handleResetLayout = useCallback(() => {
    if (graph.nodes.length === 0) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setLayoutComputed(false);
    initialFitDone.current = false;
    computeElkLayout(graph.nodes, graph.edges).then((layoutNodes) => {
      setNodes(layoutNodes);
      setEdges(graph.edges);
      setLayoutComputed(true);
    });
  }, [graph, storageKey, setNodes, setEdges]);

  // Metrics sparklines
  useEffect(() => {
    if (!metricsHistory || !layoutComputed) return;
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        const d = node.data as TopologyNodeData;
        let metricsEntry;
        if (d.kind === "Pod") {
          const key = `${d.namespace}/${d.label}`;
          metricsEntry = metricsHistory.pods.get(key);
        } else if (d.kind === "Node") {
          metricsEntry = metricsHistory.nodes.get(d.label);
        }
        if (!metricsEntry || metricsEntry.cpu.length < 2) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...d,
            sparkline: {
              cpu: metricsEntry.cpu,
              memory: metricsEntry.memory,
              latestCpu: metricsEntry.cpu[metricsEntry.cpu.length - 1],
              latestMemory: metricsEntry.memory[metricsEntry.memory.length - 1],
            },
          },
        };
      });
      return changed ? next : prev;
    });
  }, [metricsHistory, layoutComputed, setNodes]);

  // Prometheus traffic on edges
  useEffect(() => {
    if (!prometheusTraffic || prometheusTraffic.length === 0 || !layoutComputed) return;
    setEdges((prev) => {
      let changed = false;
      const next = prev.map((edge) => {
        if (edge.type !== "traffic") return edge;
        const currentNodes = nodesRef.current;
        const sourceNode = currentNodes.find((n) => n.id === edge.source);
        const targetNode = currentNodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        const srcData = sourceNode.data as TopologyNodeData;
        const tgtData = targetNode.data as TopologyNodeData;
        const match = prometheusTraffic.find(
          (t) =>
            (srcData.label.includes(t.source) || srcData.label.includes(t.destination)) &&
            (tgtData.label.includes(t.source) || tgtData.label.includes(t.destination))
        );
        if (!match) return edge;
        changed = true;
        return {
          ...edge,
          animated: true,
          data: {
            ...(edge.data || {}),
            traffic: {
              requestsPerSec: match.requestsPerSec,
              latencyP95: match.latencyP95Ms,
              errorRate: match.errorRate,
            },
          },
        } as TopologyEdge;
      });
      return changed ? next : prev;
    });
  }, [prometheusTraffic, layoutComputed, setEdges]);

  // Live traffic from metrics-server + endpoints
  useEffect(() => {
    if (!trafficSnapshot || !layoutComputed) return;

    const activePods = new Map<string, PodActivity>();
    for (const pm of trafficSnapshot.podMetrics) {
      activePods.set(`${pm.namespace}/${pm.name}`, pm);
    }

    const activeEndpoints = new Set<string>();
    for (const link of trafficSnapshot.endpointLinks) {
      if (link.ready) {
        activeEndpoints.add(`${link.serviceUid}-${link.podUid}`);
      }
    }

    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        const d = node.data as TopologyNodeData;
        if (d.kind === "Pod") {
          const key = `${d.namespace}/${d.label}`;
          const pm = activePods.get(key);
          if (pm) {
            const newCpu = `${pm.cpuMillicores}m`;
            const newMem = `${pm.memoryMi}Mi`;
            if (d.info.cpu === newCpu && d.info.memory === newMem) return node;
            changed = true;
            return {
              ...node,
              data: {
                ...d,
                info: { ...d.info, cpu: newCpu, memory: newMem },
              },
            };
          }
        }
        if (d.kind === "Node") {
          const nm = trafficSnapshot.nodeMetrics.find((n) => n.name === d.label);
          if (nm) {
            const newCpu = `${nm.cpuMillicores}m`;
            const newMem = `${nm.memoryMi}Mi`;
            if (d.info.cpu === newCpu && d.info.memory === newMem) return node;
            changed = true;
            return {
              ...node,
              data: {
                ...d,
                info: { ...d.info, cpu: newCpu, memory: newMem },
              },
            };
          }
        }
        return node;
      });
      return changed ? next : prev;
    });

    setEdges((prev) => {
      let changed = false;
      const next = prev.map((edge) => {
        const epKey = `${edge.source}-${edge.target}`;
        const reverseKey = `${edge.target}-${edge.source}`;
        const isLive = activeEndpoints.has(epKey) || activeEndpoints.has(reverseKey);

        if (isLive) {
          const ed = edge.data as Record<string, unknown> | undefined;
          if (ed?.liveTraffic) return edge;
          changed = true;
          const currentNodes = nodesRef.current;
          const targetNode = currentNodes.find((n) => n.id === edge.target);
          const tgtData = targetNode?.data as TopologyNodeData | undefined;
          let cpuLabel = "";
          if (tgtData?.kind === "Pod") {
            const pm = activePods.get(`${tgtData.namespace}/${tgtData.label}`);
            if (pm) cpuLabel = `${pm.cpuMillicores}m`;
          }
          return {
            ...edge,
            animated: true,
            data: {
              ...(edge.data || {}),
              animated: true,
              liveTraffic: true,
              cpuLabel,
            },
            style: {
              ...edge.style,
              stroke: "#00E5FF",
              strokeWidth: 2,
              opacity: 1,
            },
          } as TopologyEdge;
        }

        return edge;
      });
      return changed ? next : prev;
    });
  }, [trafficSnapshot, layoutComputed, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: { data: TopologyNodeData }) => {
      if (onNodeClick && node.data) {
        const d = node.data;
        const resource: K8sResource = {
          kind: d.kind as K8sResource["kind"],
          name: d.label,
          namespace: d.namespace,
          uid: d.uid,
          labels: d.labels || {},
          annotations: d.annotations || {},
          creationTimestamp: d.info.created || "",
          status: {
            phase: d.info.phase || "Unknown",
            ready: d.status === "healthy",
            restartCount: d.info.restarts ? parseInt(d.info.restarts) : undefined,
            containerStatuses: d.info.containers
              ? d.info.containers.split(", ").map((c) => {
                  const [name, state] = c.split(":");
                  return { name, ready: state === "running", restartCount: 0, state: state || "unknown", image: "" };
                })
              : undefined,
          },
          raw: d.raw,
        };
        onNodeClick(resource);
      }
    },
    [onNodeClick]
  );

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {!layoutComputed && graph.nodes.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
          <div className="text-xs text-neon-cyan flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
            Computing layout...
          </div>
        </div>
      )}

      {resources && graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">No resources found</p>
            <p className="text-xs mt-1">Connect to a cluster to view topology</p>
          </div>
        </div>
      )}

      {layoutComputed && graph.nodes.length > 0 && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <button
            onClick={() => setLayoutLocked((l) => !l)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
              layoutLocked
                ? "bg-neon-amber/10 border-neon-amber/50 text-neon-amber"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
            title={layoutLocked ? "Unlock nodes" : "Lock nodes in place"}
          >
            {layoutLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {layoutLocked ? "Locked" : "Unlocked"}
          </button>
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border bg-card border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Reset to auto-layout"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!layoutLocked}
        fitView={!initialFitDone.current}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-background"
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={40}
          size={1}
          color="var(--grid-line)"
        />
        <Controls
          className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>
    </div>
  );
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
