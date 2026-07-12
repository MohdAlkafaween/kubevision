import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const topology = await prisma.savedTopology.findUnique({ where: { id } });

  if (!topology) {
    return NextResponse.json({ error: "Topology not found" }, { status: 404 });
  }

  return NextResponse.json({
    topology: {
      id: topology.id,
      name: topology.name,
      contextName: topology.contextName,
      nodes: JSON.parse(topology.nodesJson),
      edges: JSON.parse(topology.edgesJson),
      createdAt: topology.createdAt,
      updatedAt: topology.updatedAt,
    },
  });
}
