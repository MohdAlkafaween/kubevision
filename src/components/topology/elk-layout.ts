import ELK from "elkjs/lib/elk.bundled.js";
import type { TopologyNode, TopologyEdge } from "@/types/topology";

const elk = new ELK();

// BaseNode renders a variable number of optional rows (namespace, phase/restarts,
// tailscale IP, CPU/MEM sparklines, req/s) on top of its fixed header+label rows.
// The layout must reserve real space for whichever rows will actually render,
// otherwise taller cards overlap the next layer down.
function estimateNodeHeight(node: TopologyNode): number {
  const data = node.data;
  let height = 56; // vertical padding + icon/kind row + label row
  if (data.namespace) height += 16;
  if (data.info?.phase) height += 16;
  if (
    data.kind === "Node" &&
    (data.annotations?.["tailscale.com/ip"] || data.annotations?.["tailscale.com/node-ip"])
  ) {
    height += 14;
  }
  if (data.sparkline && data.sparkline.cpu.length >= 2) height += 40;
  if (data.metrics?.requestsPerSec !== undefined && data.metrics.requestsPerSec > 0) height += 16;
  return height + 10; // safety margin
}

export async function computeElkLayout(
  nodes: TopologyNode[],
  edges: TopologyEdge[]
): Promise<TopologyNode[]> {
  if (nodes.length === 0) return [];

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "SPLINES",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: 200, // matches BaseNode's max-w-[200px]
      height: estimateNodeHeight(node),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layout = await elk.layout(elkGraph);

  return nodes.map((node) => {
    const elkNode = layout.children?.find((n) => n.id === node.id);
    if (elkNode) {
      return {
        ...node,
        position: {
          x: elkNode.x || 0,
          y: elkNode.y || 0,
        },
      };
    }
    return node;
  });
}
