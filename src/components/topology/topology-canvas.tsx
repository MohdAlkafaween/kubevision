"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BaseNode } from "./nodes/base-node";
import { TrafficEdge } from "./edges/traffic-edge";
import { computeElkLayout } from "./elk-layout";
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

interface TopologyCanvasProps {
  resources: ClusterResources | null;
  namespaceFilter?: string;
  onNodeClick?: (resource: K8sResource) => void;
  metricsHistory?: MetricsHistory;
  prometheusTraffic?: ServiceTraffic[];
  trafficSnapshot?: TrafficSnapshot | null;
}

export function TopologyCanvas({
  resources,
  namespaceFilter,
  onNodeClick,
  metricsHistory,
  prometheusTraffic,
  trafficSnapshot,
}: TopologyCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>([]);
  const [layoutComputed, setLayoutComputed] = useState(false);

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

    setLayoutComputed(false);
    computeElkLayout(graph.nodes, graph.edges).then((layoutNodes) => {
      setNodes(layoutNodes);
      setEdges(graph.edges);
      setLayoutComputed(true);
    });
  }, [graph, setNodes, setEdges]);

  useEffect(() => {
    if (!metricsHistory || !layoutComputed) return;
    setNodes((prev) =>
      prev.map((node) => {
        const d = node.data as TopologyNodeData;
        let metricsEntry;
        if (d.kind === "Pod") {
          const key = `${d.namespace}/${d.label}`;
          metricsEntry = metricsHistory.pods.get(key);
        } else if (d.kind === "Node") {
          metricsEntry = metricsHistory.nodes.get(d.label);
        }
        if (!metricsEntry || metricsEntry.cpu.length < 2) return node;
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
      })
    );
  }, [metricsHistory, layoutComputed, setNodes]);

  useEffect(() => {
    if (!prometheusTraffic || prometheusTraffic.length === 0 || !layoutComputed) return;
    setEdges((prev) =>
      prev.map((edge) => {
        if (edge.type !== "traffic") return edge;
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        const srcData = sourceNode.data as TopologyNodeData;
        const tgtData = targetNode.data as TopologyNodeData;
        const match = prometheusTraffic.find(
          (t) =>
            (srcData.label.includes(t.source) || srcData.label.includes(t.destination)) &&
            (tgtData.label.includes(t.source) || tgtData.label.includes(t.destination))
        );
        if (!match) return edge;
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
      })
    );
  }, [prometheusTraffic, layoutComputed, setEdges, nodes]);

  // Live traffic from metrics-server + endpoints (no Prometheus needed)
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

    setNodes((prev) =>
      prev.map((node) => {
        const d = node.data as TopologyNodeData;
        if (d.kind === "Pod") {
          const key = `${d.namespace}/${d.label}`;
          const pm = activePods.get(key);
          if (pm) {
            return {
              ...node,
              data: {
                ...d,
                info: {
                  ...d.info,
                  cpu: `${pm.cpuMillicores}m`,
                  memory: `${pm.memoryMi}Mi`,
                },
              },
            };
          }
        }
        if (d.kind === "Node") {
          const nm = trafficSnapshot.nodeMetrics.find((n) => n.name === d.label);
          if (nm) {
            return {
              ...node,
              data: {
                ...d,
                info: {
                  ...d.info,
                  cpu: `${nm.cpuMillicores}m`,
                  memory: `${nm.memoryMi}Mi`,
                },
              },
            };
          }
        }
        return node;
      })
    );

    setEdges((prev) =>
      prev.map((edge) => {
        const epKey = `${edge.source}-${edge.target}`;
        const reverseKey = `${edge.target}-${edge.source}`;
        const isLive = activeEndpoints.has(epKey) || activeEndpoints.has(reverseKey);

        if (isLive) {
          const targetNode = nodes.find((n) => n.id === edge.target);
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
      })
    );
  }, [trafficSnapshot, layoutComputed, setNodes, setEdges, nodes]);

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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
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
