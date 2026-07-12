"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PodMetricPoint {
  name: string;
  namespace: string;
  cpu: number;
  memory: number;
  timestamp: string;
}

interface NodeMetricPoint {
  name: string;
  cpu: number;
  memory: number;
  timestamp: string;
}

export interface MetricsHistory {
  pods: Map<string, { cpu: number[]; memory: number[]; latest: PodMetricPoint }>;
  nodes: Map<string, { cpu: number[]; memory: number[]; latest: NodeMetricPoint }>;
}

const MAX_HISTORY = 20;

export function useMetrics(cluster: string | null, enabled = true) {
  const [metrics, setMetrics] = useState<MetricsHistory>({
    pods: new Map(),
    nodes: new Map(),
  });
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<MetricsHistory>({ pods: new Map(), nodes: new Map() });

  const fetchMetrics = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(
        `/api/metrics/live/${encodeURIComponent(cluster)}`
      );
      const data = await res.json();
      if (data.error && data.pods.length === 0) {
        setError(data.error);
        return;
      }
      setError(null);

      const prev = historyRef.current;
      const nextPods = new Map(prev.pods);
      const nextNodes = new Map(prev.nodes);

      for (const pod of data.pods as PodMetricPoint[]) {
        const key = `${pod.namespace}/${pod.name}`;
        const existing = nextPods.get(key);
        const cpuHist = existing ? [...existing.cpu, pod.cpu].slice(-MAX_HISTORY) : [pod.cpu];
        const memHist = existing ? [...existing.memory, pod.memory].slice(-MAX_HISTORY) : [pod.memory];
        nextPods.set(key, { cpu: cpuHist, memory: memHist, latest: pod });
      }

      for (const node of data.nodes as NodeMetricPoint[]) {
        const existing = nextNodes.get(node.name);
        const cpuHist = existing ? [...existing.cpu, node.cpu].slice(-MAX_HISTORY) : [node.cpu];
        const memHist = existing ? [...existing.memory, node.memory].slice(-MAX_HISTORY) : [node.memory];
        nextNodes.set(node.name, { cpu: cpuHist, memory: memHist, latest: node });
      }

      historyRef.current = { pods: nextPods, nodes: nextNodes };
      setMetrics({ pods: nextPods, nodes: nextNodes });
    } catch {
      // silently skip fetch errors
    }
  }, [cluster]);

  useEffect(() => {
    if (!cluster || !enabled) return;
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [cluster, enabled, fetchMetrics]);

  useEffect(() => {
    historyRef.current = { pods: new Map(), nodes: new Map() };
    setMetrics({ pods: new Map(), nodes: new Map() });
    setError(null);
  }, [cluster]);

  return { metrics, error };
}
