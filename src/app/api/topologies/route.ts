import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const context = searchParams.get("context");

  const where = context ? { contextName: context } : {};
  const topologies = await prisma.savedTopology.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      contextName: true,
      nodeCount: true,
      edgeCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ topologies });
}

export async function POST(request: Request) {
  try {
    const { name, contextName, nodes, edges } = await request.json();

    if (!name || !nodes) {
      return NextResponse.json({ error: "name and nodes are required" }, { status: 400 });
    }

    const nodesJson = typeof nodes === "string" ? nodes : JSON.stringify(nodes);
    const edgesJson = typeof edges === "string" ? edges : JSON.stringify(edges || []);
    const nodeCount = Array.isArray(nodes) ? nodes.length : JSON.parse(nodesJson).length;
    const edgeCount = Array.isArray(edges) ? edges.length : JSON.parse(edgesJson).length;

    const topology = await prisma.savedTopology.create({
      data: { name, contextName: contextName || null, nodesJson, edgesJson, nodeCount, edgeCount },
    });

    return NextResponse.json({ topology: { id: topology.id, name: topology.name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save topology";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, nodes, edges } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (nodes !== undefined) {
      data.nodesJson = typeof nodes === "string" ? nodes : JSON.stringify(nodes);
      data.nodeCount = Array.isArray(nodes) ? nodes.length : JSON.parse(data.nodesJson as string).length;
    }
    if (edges !== undefined) {
      data.edgesJson = typeof edges === "string" ? edges : JSON.stringify(edges);
      data.edgeCount = Array.isArray(edges) ? edges.length : JSON.parse(data.edgesJson as string).length;
    }

    await prisma.savedTopology.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update topology";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.savedTopology.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete topology";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
