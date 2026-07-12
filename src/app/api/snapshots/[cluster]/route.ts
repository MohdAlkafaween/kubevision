import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchClusterResources } from "@/lib/k8s/resources";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);

  const snapshots = await prisma.snapshot.findMany({
    where: { contextName },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, resourceCount: true, createdAt: true },
    take: 50,
  });

  return NextResponse.json(snapshots);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);
  const body = await request.json();
  const label = (body.label as string) || "";

  const resources = await fetchClusterResources(contextName);

  const flatResources = [
    ...resources.nodes.map((r) => ({ ...r, _kind: "Node" })),
    ...resources.pods.map((r) => ({ ...r, _kind: "Pod" })),
    ...resources.deployments.map((r) => ({ ...r, _kind: "Deployment" })),
    ...resources.services.map((r) => ({ ...r, _kind: "Service" })),
    ...resources.statefulSets.map((r) => ({ ...r, _kind: "StatefulSet" })),
    ...resources.daemonSets.map((r) => ({ ...r, _kind: "DaemonSet" })),
    ...resources.configMaps.map((r) => ({ ...r, _kind: "ConfigMap" })),
    ...resources.secrets.map((r) => ({ ...r, _kind: "Secret" })),
    ...resources.pvcs.map((r) => ({ ...r, _kind: "PVC" })),
    ...resources.pvs.map((r) => ({ ...r, _kind: "PV" })),
    ...resources.ingresses.map((r) => ({ ...r, _kind: "Ingress" })),
    ...resources.jobs.map((r) => ({ ...r, _kind: "Job" })),
    ...resources.cronJobs.map((r) => ({ ...r, _kind: "CronJob" })),
    ...resources.namespaces.map((r) => ({ ...r, _kind: "Namespace" })),
    ...resources.networkPolicies.map((r) => ({ ...r, _kind: "NetworkPolicy" })),
  ];

  const snapshot = await prisma.snapshot.create({
    data: {
      contextName,
      label,
      data: JSON.stringify(flatResources),
      resourceCount: flatResources.length,
    },
  });

  return NextResponse.json({
    id: snapshot.id,
    label: snapshot.label,
    resourceCount: snapshot.resourceCount,
    createdAt: snapshot.createdAt,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { id } = await request.json();
  await prisma.snapshot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
