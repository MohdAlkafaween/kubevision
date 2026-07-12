import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;

  try {
    const config = await prisma.clusterConfig.findUnique({
      where: { contextName: cluster },
    });

    return NextResponse.json({
      config: config || {
        contextName: cluster,
        prometheusUrl: null,
        displayName: null,
        impersonateUser: null,
        impersonateGroups: null,
        allowExec: false,
        allowDelete: false,
        allowApply: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;

  try {
    const body = await request.json();

    const config = await prisma.clusterConfig.upsert({
      where: { contextName: cluster },
      update: {
        prometheusUrl: body.prometheusUrl ?? null,
        displayName: body.displayName ?? null,
        impersonateUser: body.impersonateUser ?? null,
        impersonateGroups: body.impersonateGroups ?? null,
        allowExec: body.allowExec ?? false,
        allowDelete: body.allowDelete ?? false,
        allowApply: body.allowApply ?? false,
      },
      create: {
        contextName: cluster,
        prometheusUrl: body.prometheusUrl ?? null,
        displayName: body.displayName ?? null,
        impersonateUser: body.impersonateUser ?? null,
        impersonateGroups: body.impersonateGroups ?? null,
        allowExec: body.allowExec ?? false,
        allowDelete: body.allowDelete ?? false,
        allowApply: body.allowApply ?? false,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
