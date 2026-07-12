import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
    const cluster = searchParams.get("cluster") || undefined;

    const where = cluster ? { cluster } : undefined;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, limit, offset });
  } catch {
    return NextResponse.json({ logs: [], total: 0, limit: 50, offset: 0 });
  }
}

export async function DELETE() {
  try {
    await prisma.auditLog.deleteMany({});
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to clear audit logs" }, { status: 500 });
  }
}
