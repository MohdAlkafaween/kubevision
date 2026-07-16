"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PlanNode, type PlanNodeData, type DriftDetail } from "./plan-node";
import { ClusterNode, type ClusterNodeData } from "./cluster-node";
import { PlanEdge, type PlanEdgeData } from "./plan-edge";
import { ResourcePalette, PALETTE_ITEMS } from "./resource-palette";
import { PropertyEditor } from "./property-editor";
import { SavedTopologies } from "./saved-topologies";
import { PlaybookPanel } from "./playbook-panel";
import { ValidationPanel } from "./validation-panel";
import { exportToYaml, exportPlanAsJson } from "@/lib/planner/yaml-export";
import {
  validateTopology,
  groupErrorsByNode,
  type ValidationError,
} from "@/lib/planner/validation-engine";
import {
  Download,
  FileCode,
  Save,
  Upload,
  Trash2,
  FileJson,
  Copy,
  Check,
  LayoutGrid,
  GitCompare,
  Loader2,
  GitPullRequest,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import type { ClusterResources, K8sResource } from "@/types/k8s";

const nodeTypes: NodeTypes = {
  planNode: PlanNode,
  clusterNode: ClusterNode,
};

const edgeTypes: EdgeTypes = {
  planEdge: PlanEdge,
};

function PlanningCanvasInner({ cluster }: { cluster: string | null }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PlanNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<PlanEdgeData>>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showYaml, setShowYaml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [planName, setPlanName] = useState("Untitled Architecture");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [creatingPr, setCreatingPr] = useState(false);
  const [prResult, setPrResult] = useState<{ url?: string; error?: string } | null>(null);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;

  const validationErrors = useMemo(
    () => validateTopology(nodes as Node<PlanNodeData>[], edges as Edge<PlanEdgeData>[]),
    [nodes, edges]
  );

  const errorsByNode = useMemo(() => groupErrorsByNode(validationErrors), [validationErrors]);

  const validationErrorCount = validationErrors.filter((e) => e.severity === "error").length;
  const validationWarnCount = validationErrors.filter((e) => e.severity === "warning").length;

  const nodesWithValidation = useMemo(() => {
    if (validationErrors.length === 0) return nodes;
    return nodes.map((n) => {
      const nodeErrors = errorsByNode.get(n.id);
      if (!nodeErrors || nodeErrors.length === 0) {
        if (n.data.validationErrors && n.data.validationErrors.length > 0) {
          return { ...n, data: { ...n.data, validationErrors: undefined } };
        }
        return n;
      }
      return {
        ...n,
        data: {
          ...n.data,
          validationErrors: nodeErrors.map((e) => ({
            severity: e.severity,
            rule: e.rule,
            message: e.message,
          })),
        },
      };
    });
  }, [nodes, validationErrors, errorsByNode]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        type: "planEdge",
        data: {
          label: "",
          connectionType: "routes-to" as const,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds) as Edge<PlanEdgeData>[]);
    },
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/kubevision-resource");
      if (!data) return;

      const item = JSON.parse(data);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      if (item.kind === "Cluster") {
        const clusterNode: Node<ClusterNodeData> = {
          id: `Cluster-${Date.now()}`,
          type: "clusterNode",
          position,
          style: { width: 600, height: 400 },
          data: {
            kind: "Cluster",
            label: item.defaultConfig?.name || "my-cluster",
            icon: "⎈",
            config: { ...item.defaultConfig },
            notes: "",
            namespace: "",
            color: "",
          },
        };
        setNodes((nds) => [clusterNode as Node<PlanNodeData>, ...nds]);
        return;
      }

      const newNode: Node<PlanNodeData> = {
        id: `${item.kind}-${Date.now()}`,
        type: "planNode",
        position,
        data: {
          kind: item.kind,
          label: `my-${item.kind.toLowerCase()}`,
          icon: item.icon,
          config: { ...item.defaultConfig },
          notes: "",
          namespace: "default",
          color: "",
          replicas: item.defaultConfig.replicas,
        },
      };

      setNodes((nds) => {
        const clusterNodes = nds.filter((n) => n.type === "clusterNode");
        for (const cn of clusterNodes) {
          const cw = (cn.style?.width as number) || 600;
          const ch = (cn.style?.height as number) || 400;
          if (
            position.x >= cn.position.x &&
            position.x <= cn.position.x + cw &&
            position.y >= cn.position.y &&
            position.y <= cn.position.y + ch
          ) {
            newNode.parentId = cn.id;
            newNode.extent = "parent";
            newNode.position = {
              x: position.x - cn.position.x,
              y: position.y - cn.position.y,
            };
            break;
          }
        }
        return [...nds, newNode];
      });
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, []);

  const updateNode = useCallback(
    (id: string, data: Partial<PlanNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n))
      );
    },
    [setNodes]
  );

  const updateEdge = useCallback(
    (id: string, data: Partial<PlanEdgeData>) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id ? { ...e, data: { ...(e.data || {}), ...data } as PlanEdgeData } : e
        )
      );
    },
    [setEdges]
  );

  const handleQuickFix = useCallback(
    (error: ValidationError) => {
      const fix = error.quickFix;
      if (!fix) return;

      if (fix.action === "add-node") {
        const sourceNode = nodes.find((n) => n.id === error.nodeId);
        const baseX = sourceNode?.position.x ?? 200;
        const baseY = sourceNode?.position.y ?? 200;

        const newId = `${fix.payload.kind}-${Date.now()}`;
        const newNode: Node<PlanNodeData> = {
          id: newId,
          type: "planNode",
          position: {
            x: baseX + (fix.payload.sourceNodeId ? 0 : -200),
            y: baseY + (fix.payload.sourceNodeId ? 150 : -150),
          },
          data: {
            kind: fix.payload.kind as string,
            label: fix.payload.label as string,
            icon: fix.payload.icon as string,
            config: {},
            notes: "",
            namespace: (fix.payload.namespace as string) || "default",
            color: "",
          },
        };

        setNodes((nds) => [...nds, newNode]);

        if (fix.payload.sourceNodeId) {
          setEdges((eds) =>
            addEdge(
              {
                id: `e-${error.nodeId}-${newId}`,
                source: error.nodeId,
                target: newId,
                type: "planEdge",
                data: { label: "", connectionType: "routes-to" as const },
              },
              eds
            )
          );
        } else if (fix.payload.targetNodeId) {
          setEdges((eds) =>
            addEdge(
              {
                id: `e-${newId}-${error.nodeId}`,
                source: newId,
                target: error.nodeId,
                type: "planEdge",
                data: { label: "", connectionType: "routes-to" as const },
              },
              eds
            )
          );
        }
      } else if (fix.action === "set-field") {
        const updates: Partial<PlanNodeData> = {};
        for (const [key, value] of Object.entries(fix.payload)) {
          (updates as Record<string, unknown>)[key] = value;
        }
        updateNode(error.nodeId, updates);
      } else if (fix.action === "add-edge") {
        const targetId = fix.payload.targetNodeId as string;
        if (targetId) {
          setEdges((eds) =>
            addEdge(
              {
                id: `e-${error.nodeId}-${targetId}`,
                source: error.nodeId,
                target: targetId,
                type: "planEdge",
                data: { label: "", connectionType: "routes-to" as const },
              },
              eds
            )
          );
        }
      }
    },
    [nodes, setNodes, setEdges, updateNode]
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
    },
    [nodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id));
      setSelectedEdgeId(null);
    },
    [setEdges]
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const newId = `${node.data.kind}-${Date.now()}`;
      const newNode: Node<PlanNodeData> = {
        ...node,
        id: newId,
        selected: false,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        data: {
          ...node.data,
          label: node.data.label.replace(/-copy\d*$/, "") + "-copy",
          validationErrors: undefined,
          driftStatus: undefined,
          driftDetails: undefined,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes, setNodes]
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    []
  );

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setNodes, setEdges]);

  const yamlOutput = exportToYaml(
    nodes as Node<PlanNodeData>[],
    edges as Edge<PlanEdgeData>[]
  );

  const copyYaml = () => {
    navigator.clipboard.writeText(yamlOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlOutput], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${planName.toLowerCase().replace(/\s+/g, "-")}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savePlan = useCallback(async () => {
    if (nodes.length === 0) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const nodeData = nodes.map((n) => ({ id: n.id, position: n.position, data: n.data }));
      const edgeData = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data }));
      const res = await fetch("/api/topologies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: planName,
          contextName: cluster,
          nodes: nodeData,
          edges: edgeData,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveMessage(data.error);
      } else {
        setSaveMessage("Saved!");
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch {
      setSaveMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, planName, cluster]);

  const loadPlan = useCallback(() => {
    setShowSavedPanel(true);
  }, []);

  const handleLoadTopology = useCallback(
    (loadedNodes: unknown[], loadedEdges: unknown[], name: string) => {
      setNodes(
        (loadedNodes as Array<{ id: string; position: { x: number; y: number }; data: PlanNodeData }>).map((n) => ({
          ...n,
          type: "planNode",
        }))
      );
      setEdges(
        (loadedEdges as Array<{ id: string; source: string; target: string; data: PlanEdgeData }>).map((e) => ({
          ...e,
          type: "planEdge",
        }))
      );
      setPlanName(name);
      setShowSavedPanel(false);
    },
    [setNodes, setEdges]
  );

  const autoLayout = useCallback(async () => {
    if (nodes.length === 0) return;
    const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
    const elk = new ELK();

    const graph = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "80",
        "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      },
      children: nodes.map((n) => ({ id: n.id, width: 180, height: 90 })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    });

    setNodes((nds) =>
      nds.map((n) => {
        const elkNode = graph.children?.find((c) => c.id === n.id);
        return elkNode ? { ...n, position: { x: elkNode.x || 0, y: elkNode.y || 0 } } : n;
      })
    );
  }, [nodes, edges, setNodes]);

  const reconcile = useCallback(async () => {
    if (!cluster || nodes.length === 0) return;
    setReconciling(true);
    setReconcileResult(null);

    try {
      const res = await fetch(`/api/resources/${encodeURIComponent(cluster)}`);
      const liveResources: ClusterResources = await res.json();

      const allLive: K8sResource[] = [
        ...liveResources.pods,
        ...liveResources.deployments,
        ...liveResources.services,
        ...liveResources.statefulSets,
        ...liveResources.daemonSets,
        ...liveResources.ingresses,
        ...liveResources.pvcs,
        ...liveResources.pvs,
        ...liveResources.configMaps,
        ...liveResources.secrets,
        ...liveResources.namespaces,
        ...liveResources.nodes,
      ];

      let matched = 0, drifted = 0, missing = 0;

      setNodes((nds) =>
        nds.map((node) => {
          const d = node.data;
          const liveMatch = allLive.find(
            (r) =>
              r.kind.toLowerCase() === d.kind.toLowerCase() &&
              r.name === d.label &&
              (r.namespace || "default") === (d.namespace || "default")
          );

          if (!liveMatch) {
            missing++;
            return {
              ...node,
              data: { ...d, driftStatus: "missing" as const, driftDetails: [] },
            };
          }

          const driftDetails: DriftDetail[] = [];

          if (d.replicas !== undefined) {
            const raw = liveMatch.raw as Record<string, unknown>;
            const spec = (raw?.spec || {}) as Record<string, unknown>;
            const liveReplicas = spec.replicas as number | undefined;
            if (liveReplicas !== undefined && liveReplicas !== d.replicas) {
              driftDetails.push({
                field: "replicas",
                planned: String(d.replicas),
                live: String(liveReplicas),
              });
            }
          }

          const configImage = d.config.image as string | undefined;
          if (configImage) {
            const raw = liveMatch.raw as Record<string, unknown>;
            const spec = (raw?.spec || {}) as Record<string, unknown>;
            const template = (spec?.template || {}) as Record<string, unknown>;
            const tSpec = (template?.spec || spec) as Record<string, unknown>;
            const containers = (tSpec?.containers || []) as Array<Record<string, unknown>>;
            const liveImage = containers[0]?.image as string | undefined;
            if (liveImage && liveImage !== configImage) {
              driftDetails.push({
                field: "image",
                planned: configImage,
                live: liveImage,
              });
            }
          }

          if (driftDetails.length > 0) {
            drifted++;
            return {
              ...node,
              data: { ...d, driftStatus: "drifted" as const, driftDetails },
            };
          }

          matched++;
          return {
            ...node,
            data: { ...d, driftStatus: "matched" as const, driftDetails: [] },
          };
        })
      );

      setReconcileResult(`${matched} synced, ${drifted} drifted, ${missing} missing`);
    } catch (err) {
      setReconcileResult("Failed to reconcile");
    } finally {
      setReconciling(false);
    }
  }, [cluster, nodes, setNodes]);

  const createPR = useCallback(async () => {
    if (!cluster || nodes.length === 0) return;
    setCreatingPr(true);
    setPrResult(null);
    try {
      const resources = nodes.map((n) => ({
        kind: n.data.kind,
        label: n.data.label,
        config: n.data.config,
      }));
      const res = await fetch("/api/gitops/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: cluster,
          resources,
          title: `[KubeVision] ${planName}`,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setPrResult({ error: data.error });
      } else {
        setPrResult({ url: data.prUrl });
      }
    } catch (err) {
      setPrResult({ error: err instanceof Error ? err.message : "Failed to create PR" });
    } finally {
      setCreatingPr(false);
    }
  }, [cluster, nodes, planName]);

  const clipboardRef = useRef<{
    nodes: Node<PlanNodeData>[];
    edges: Edge<PlanEdgeData>[];
  } | null>(null);

  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        const selectedEdgeIds = edges.filter((ed) => ed.selected).map((ed) => ed.id);

        if (selectedIds.length > 0) {
          setNodes((nds) => nds.filter((n) => !selectedIds.includes(n.id)));
          setEdges((eds) =>
            eds.filter(
              (ed) =>
                !selectedIds.includes(ed.source) &&
                !selectedIds.includes(ed.target) &&
                !selectedEdgeIds.includes(ed.id)
            )
          );
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        } else if (selectedEdgeIds.length > 0) {
          setEdges((eds) => eds.filter((ed) => !selectedEdgeIds.includes(ed.id)));
          setSelectedEdgeId(null);
        }
      }

      if (mod && e.key === "c") {
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();

        const selectedIds = new Set(selected.map((n) => n.id));
        const relatedEdges = edges.filter(
          (ed) => selectedIds.has(ed.source) && selectedIds.has(ed.target)
        );

        clipboardRef.current = {
          nodes: selected as Node<PlanNodeData>[],
          edges: relatedEdges as Edge<PlanEdgeData>[],
        };
      }

      if (mod && e.key === "v") {
        if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;
        e.preventDefault();

        const idMap = new Map<string, string>();
        const ts = Date.now();

        const newNodes: Node<PlanNodeData>[] = clipboardRef.current.nodes.map(
          (n, i) => {
            const newId = `${n.data.kind}-${ts}-${i}`;
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              selected: false,
              position: { x: n.position.x + 40, y: n.position.y + 40 },
              data: {
                ...n.data,
                label: n.data.label.replace(/-copy\d*$/, "") + "-copy",
                validationErrors: undefined,
              },
            };
          }
        );

        const newEdges: Edge<PlanEdgeData>[] = clipboardRef.current.edges
          .map((ed) => {
            const newSource = idMap.get(ed.source);
            const newTarget = idMap.get(ed.target);
            if (!newSource || !newTarget) return null;
            return {
              ...ed,
              id: `e-${newSource}-${newTarget}`,
              source: newSource,
              target: newTarget,
              selected: false,
            };
          })
          .filter(Boolean) as Edge<PlanEdgeData>[];

        setNodes((nds) => [...nds, ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, setNodes, setEdges]);

  return (
    <div className="flex h-full">
      <ResourcePalette />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-[var(--terminal-header)]">
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            className="bg-transparent text-xs font-medium text-foreground focus:outline-none border-b border-transparent focus:border-neon-cyan w-48"
          />

          <div className="ml-auto flex items-center gap-1">
            <ToolbarButton icon={<LayoutGrid className="w-3 h-3" />} label="Auto Layout" onClick={autoLayout} />
            <ToolbarButton icon={<Upload className="w-3 h-3" />} label="Load" onClick={loadPlan} active={showSavedPanel} />
            <ToolbarButton
              icon={saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              label={saveMessage || "Save"}
              onClick={savePlan}
            />
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              icon={reconciling ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitCompare className="w-3 h-3" />}
              label={reconciling ? "Checking..." : "Reconcile"}
              onClick={reconcile}
            />
            {reconcileResult && (
              <span className="text-[9px] text-muted-foreground px-1">{reconcileResult}</span>
            )}
            <ToolbarButton
              icon={creatingPr ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitPullRequest className="w-3 h-3" />}
              label={creatingPr ? "Creating..." : "Create PR"}
              onClick={createPR}
            />
            {prResult?.url && (
              <a href={prResult.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-neon-green hover:underline px-1">
                PR opened
              </a>
            )}
            {prResult?.error && (
              <span className="text-[9px] text-neon-red px-1 max-w-[200px] truncate" title={prResult.error}>
                {prResult.error}
              </span>
            )}
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              icon={<BookOpen className="w-3 h-3" />}
              label="Playbook"
              onClick={() => setShowPlaybook(!showPlaybook)}
              active={showPlaybook}
            />
            <ToolbarButton
              icon={
                validationErrorCount > 0 ? (
                  <AlertTriangle className="w-3 h-3 text-neon-red" />
                ) : validationWarnCount > 0 ? (
                  <AlertTriangle className="w-3 h-3 text-neon-amber" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-neon-green" />
                )
              }
              label={
                validationErrorCount + validationWarnCount > 0
                  ? `${validationErrorCount + validationWarnCount} issue${validationErrorCount + validationWarnCount !== 1 ? "s" : ""}`
                  : "Valid"
              }
              onClick={() => setShowValidation(!showValidation)}
              active={showValidation}
            />
            <ToolbarButton
              icon={<FileCode className="w-3 h-3" />}
              label="YAML"
              onClick={() => setShowYaml(!showYaml)}
              active={showYaml}
            />
            <ToolbarButton icon={<Download className="w-3 h-3" />} label="Export" onClick={downloadYaml} />
            <div className="w-px h-4 bg-border mx-1" />
            <ToolbarButton
              icon={<Trash2 className="w-3 h-3" />}
              label="Clear"
              onClick={clearCanvas}
              danger
            />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Canvas */}
          <div className="flex-1 relative min-h-0" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodesWithValidation}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeContextMenu={onNodeContextMenu}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "planEdge" }}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.1}
              maxZoom={3}
              proOptions={{ hideAttribution: true }}
              className="!bg-background"
              connectionLineStyle={{ stroke: "#00E5FF", strokeWidth: 2 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--grid-line)" />
              <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
            </ReactFlow>

            {contextMenu && (
              <div
                className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={() => setContextMenu(null)}
              >
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    duplicateNode(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                >
                  <Copy className="w-3 h-3 text-neon-cyan" />
                  Duplicate
                </button>
                <div className="h-px bg-border mx-2 my-0.5" />
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-neon-red hover:bg-neon-red/10 transition-colors"
                  onClick={() => {
                    deleteNode(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            )}

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-2xl mb-2">🏗️</div>
                  <p className="text-sm text-muted-foreground">Drag resources from the palette</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Connect them to build your architecture
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* YAML Preview */}
          {showYaml && (
            <div className="w-80 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-[var(--terminal-header)]">
                <span className="text-[10px] text-neon-green uppercase tracking-wider">
                  Generated YAML
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={copyYaml}
                    className="text-muted-foreground hover:text-neon-cyan transition-colors p-0.5"
                  >
                    {copied ? <Check className="w-3 h-3 text-neon-green" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={downloadYaml}
                    className="text-muted-foreground hover:text-neon-cyan transition-colors p-0.5"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {nodes.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    Add resources to generate YAML manifests
                  </div>
                ) : (
                  <pre className="p-3 text-[10px] text-neon-green/80 leading-relaxed whitespace-pre-wrap">
                    {yamlOutput}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Saved Topologies Panel */}
          {showSavedPanel && !showYaml && !showPlaybook && (
            <SavedTopologies
              onClose={() => setShowSavedPanel(false)}
              onLoad={handleLoadTopology}
            />
          )}

          {/* Playbook Panel */}
          {showPlaybook && !showYaml && !showValidation && (
            <PlaybookPanel
              nodes={nodes as Node<PlanNodeData>[]}
              edges={edges as Edge<PlanEdgeData>[]}
              planName={planName}
              onClose={() => setShowPlaybook(false)}
            />
          )}

          {/* Validation Panel */}
          {showValidation && !showYaml && !showPlaybook && (
            <ValidationPanel
              errors={validationErrors}
              onClose={() => setShowValidation(false)}
              onQuickFix={handleQuickFix}
              onFocusNode={focusNode}
            />
          )}

          {/* Property Editor */}
          {(selectedNode || selectedEdge) && !showYaml && !showSavedPanel && !showPlaybook && !showValidation && (
            <PropertyEditor
              selectedNode={selectedNode as Node<PlanNodeData> | null}
              selectedEdge={selectedEdge as Edge<PlanEdgeData> | null}
              onUpdateNode={updateNode}
              onUpdateEdge={updateEdge}
              onDeleteNode={deleteNode}
              onDeleteEdge={deleteEdge}
              onClose={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              validationErrors={validationErrors}
              onQuickFix={handleQuickFix}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
        active
          ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
          : danger
          ? "text-muted-foreground hover:text-neon-red hover:bg-neon-red/5"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
      title={label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

export function PlanningCanvas({ cluster }: { cluster: string | null }) {
  return (
    <ReactFlowProvider>
      <PlanningCanvasInner cluster={cluster} />
    </ReactFlowProvider>
  );
}
