import { NextResponse } from "next/server";
import { getKubeConfig, getCoreApi, getMetricsClient } from "@/lib/k8s/client";
import * as k8s from "@kubernetes/client-node";

export const dynamic = "force-dynamic";

interface PodActivity {
  name: string;
  namespace: string;
  cpuMillicores: number;
  memoryMi: number;
}

interface EndpointLink {
  serviceName: string;
  serviceNamespace: string;
  serviceUid: string;
  podName: string;
  podNamespace: string;
  podUid: string;
  ports: Array<{ port: number; protocol: string }>;
  ready: boolean;
}

interface TrafficSnapshot {
  podMetrics: PodActivity[];
  endpointLinks: EndpointLink[];
  nodeMetrics: Array<{ name: string; cpuMillicores: number; memoryMi: number }>;
  timestamp: number;
}

function parseCpu(value: string): number {
  if (value.endsWith("n")) return parseInt(value) / 1e6;
  if (value.endsWith("u")) return parseInt(value) / 1e3;
  if (value.endsWith("m")) return parseInt(value);
  return parseFloat(value) * 1000;
}

function parseMem(value: string): number {
  if (value.endsWith("Ki")) return parseInt(value) / 1024;
  if (value.endsWith("Mi")) return parseInt(value);
  if (value.endsWith("Gi")) return parseInt(value) * 1024;
  return parseFloat(value) / (1024 * 1024);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);

  try {
    const core = getCoreApi(contextName);
    const metrics = getMetricsClient(contextName);

    const [podMetricsRes, nodeMetricsRes, endpointsRes, servicesRes, podsRes] =
      await Promise.allSettled([
        metrics.getPodMetrics(),
        metrics.getNodeMetrics(),
        core.listEndpointsForAllNamespaces(),
        core.listServiceForAllNamespaces(),
        core.listPodForAllNamespaces(),
      ]);

    const podMetrics: PodActivity[] = [];
    if (podMetricsRes.status === "fulfilled") {
      for (const item of podMetricsRes.value.items) {
        let cpuTotal = 0;
        let memTotal = 0;
        for (const c of item.containers || []) {
          cpuTotal += parseCpu(c.usage?.cpu || "0");
          memTotal += parseMem(c.usage?.memory || "0");
        }
        podMetrics.push({
          name: item.metadata?.name || "",
          namespace: item.metadata?.namespace || "",
          cpuMillicores: Math.round(cpuTotal * 10) / 10,
          memoryMi: Math.round(memTotal * 10) / 10,
        });
      }
    }

    const nodeMetrics: TrafficSnapshot["nodeMetrics"] = [];
    if (nodeMetricsRes.status === "fulfilled") {
      for (const item of nodeMetricsRes.value.items) {
        nodeMetrics.push({
          name: item.metadata?.name || "",
          cpuMillicores: Math.round(parseCpu(item.usage?.cpu || "0") * 10) / 10,
          memoryMi: Math.round(parseMem(item.usage?.memory || "0") * 10) / 10,
        });
      }
    }

    const podUidMap = new Map<string, string>();
    if (podsRes.status === "fulfilled") {
      for (const pod of podsRes.value.items) {
        const key = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
        podUidMap.set(key, pod.metadata?.uid || "");
      }
    }

    const serviceUidMap = new Map<string, string>();
    if (servicesRes.status === "fulfilled") {
      for (const svc of servicesRes.value.items) {
        const key = `${svc.metadata?.namespace}/${svc.metadata?.name}`;
        serviceUidMap.set(key, svc.metadata?.uid || "");
      }
    }

    const endpointLinks: EndpointLink[] = [];
    if (endpointsRes.status === "fulfilled") {
      for (const ep of endpointsRes.value.items) {
        const epName = ep.metadata?.name || "";
        const epNs = ep.metadata?.namespace || "";
        const svcUid = serviceUidMap.get(`${epNs}/${epName}`) || "";

        for (const subset of ep.subsets || []) {
          const ports = (subset.ports || []).map((p) => ({
            port: p.port || 0,
            protocol: p.protocol || "TCP",
          }));

          for (const addr of subset.addresses || []) {
            const targetRef = addr.targetRef;
            if (targetRef?.kind === "Pod") {
              const podKey = `${targetRef.namespace || epNs}/${targetRef.name}`;
              endpointLinks.push({
                serviceName: epName,
                serviceNamespace: epNs,
                serviceUid: svcUid,
                podName: targetRef.name || "",
                podNamespace: targetRef.namespace || epNs,
                podUid: podUidMap.get(podKey) || targetRef.uid || "",
                ports,
                ready: true,
              });
            }
          }

          for (const addr of subset.notReadyAddresses || []) {
            const targetRef = addr.targetRef;
            if (targetRef?.kind === "Pod") {
              const podKey = `${targetRef.namespace || epNs}/${targetRef.name}`;
              endpointLinks.push({
                serviceName: epName,
                serviceNamespace: epNs,
                serviceUid: svcUid,
                podName: targetRef.name || "",
                podNamespace: targetRef.namespace || epNs,
                podUid: podUidMap.get(podKey) || targetRef.uid || "",
                ports,
                ready: false,
              });
            }
          }
        }
      }
    }

    const snapshot: TrafficSnapshot = {
      podMetrics,
      endpointLinks,
      nodeMetrics,
      timestamp: Date.now(),
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch traffic data";
    return NextResponse.json(
      { podMetrics: [], endpointLinks: [], nodeMetrics: [], timestamp: Date.now(), error: message },
      { status: 200 }
    );
  }
}
