import { NextResponse } from "next/server";
import { getKubeConfig } from "@/lib/k8s/client";
import * as k8s from "@kubernetes/client-node";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);

  try {
    const kc = getKubeConfig(contextName);
    const metricsClient = new k8s.Metrics(kc);

    const [podMetrics, nodeMetrics] = await Promise.allSettled([
      metricsClient.getPodMetrics(),
      metricsClient.getNodeMetrics(),
    ]);

    const pods =
      podMetrics.status === "fulfilled"
        ? podMetrics.value.items.map((item) => ({
            name: item.metadata?.name || "",
            namespace: item.metadata?.namespace || "",
            cpu: sumContainerMetric(item.containers, "cpu"),
            memory: sumContainerMetric(item.containers, "memory"),
            timestamp: item.timestamp || new Date().toISOString(),
          }))
        : [];

    const nodes =
      nodeMetrics.status === "fulfilled"
        ? nodeMetrics.value.items.map((item) => ({
            name: item.metadata?.name || "",
            cpu: parseMetricValue(item.usage?.cpu || "0"),
            memory: parseMetricValue(item.usage?.memory || "0"),
            cpuCapacity: 0,
            memoryCapacity: 0,
            timestamp: item.timestamp || new Date().toISOString(),
          }))
        : [];

    return NextResponse.json({ pods, nodes, timestamp: Date.now() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch metrics";
    return NextResponse.json({ error: message, pods: [], nodes: [] }, { status: 200 });
  }
}

function sumContainerMetric(
  containers: Array<{ usage: { cpu?: string; memory?: string } }>,
  metric: "cpu" | "memory"
): number {
  return containers.reduce(
    (sum, c) => sum + parseMetricValue(c.usage?.[metric] || "0"),
    0
  );
}

function parseMetricValue(value: string): number {
  if (value.endsWith("n")) return parseInt(value) / 1e6;
  if (value.endsWith("u")) return parseInt(value) / 1e3;
  if (value.endsWith("m")) return parseInt(value);
  if (value.endsWith("Ki")) return parseInt(value) * 1024;
  if (value.endsWith("Mi")) return parseInt(value) * 1024 * 1024;
  if (value.endsWith("Gi")) return parseInt(value) * 1024 * 1024 * 1024;
  return parseFloat(value) || 0;
}
