import ELK from "elkjs/lib/elk.bundled.js";
import type { TopologyNode, TopologyEdge } from "@/types/topology";

const elk = new ELK();

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
      width: 180,
      height: node.data.kind === "Node" ? 80 : 65,
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
