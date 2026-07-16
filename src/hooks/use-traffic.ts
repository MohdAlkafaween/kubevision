"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface PodActivity {
  name: string;
  namespace: string;
  cpuMillicores: number;
  memoryMi: number;
}

export interface EndpointLink {
  serviceName: string;
  serviceNamespace: string;
  serviceUid: string;
  podName: string;
  podNamespace: string;
  podUid: string;
  ports: Array<{ port: number; protocol: string }>;
  ready: boolean;
}

export interface TrafficSnapshot {
  podMetrics: PodActivity[];
  endpointLinks: EndpointLink[];
  nodeMetrics: Array<{ name: string; cpuMillicores: number; memoryMi: number }>;
  timestamp: number;
}

export function useTraffic(cluster: string | null, intervalMs = 5000) {
  const [data, setData] = useState<TrafficSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/traffic/${encodeURIComponent(cluster)}`);
      if (!res.ok) return;
      const json: TrafficSnapshot = await res.json();
      setData(json);
    } catch {
      // silent
    }
  }, [cluster]);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetch_, intervalMs]);

  useEffect(() => {
    setData(null);
  }, [cluster]);

  return data;
}
