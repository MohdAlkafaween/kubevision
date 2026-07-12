import { NextResponse } from "next/server";
import { PrometheusClient } from "@/lib/prometheus/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);
  const url = new URL(request.url);
  let prometheusUrl = url.searchParams.get("prometheusUrl");

  if (!prometheusUrl) {
    const config = await prisma.clusterConfig.findUnique({
      where: { contextName },
      select: { prometheusUrl: true },
    });
    prometheusUrl = config?.prometheusUrl || null;
  }

  if (!prometheusUrl) {
    return NextResponse.json({
      cluster: contextName,
      traffic: [],
      resourceMetrics: {},
      configured: false,
    });
  }

  try {
    const client = new PrometheusClient(prometheusUrl);
    const [traffic, resourceMetrics] = await Promise.allSettled([
      client.getServiceTraffic(),
      client.getResourceMetrics(),
    ]);

    return NextResponse.json({
      cluster: contextName,
      traffic: traffic.status === "fulfilled" ? traffic.value : [],
      resourceMetrics:
        resourceMetrics.status === "fulfilled"
          ? Object.fromEntries(resourceMetrics.value)
          : {},
      configured: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch metrics";
    return NextResponse.json({ error: message, configured: true }, { status: 500 });
  }
}
