"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ServiceTraffic } from "@/types/metrics";

export interface PrometheusData {
  traffic: ServiceTraffic[];
  configured: boolean;
}

export function usePrometheus(cluster: string | null) {
  const [data, setData] = useState<PrometheusData>({ traffic: [], configured: false });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTraffic = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/metrics/${encodeURIComponent(cluster)}`);
      if (!res.ok) return;
      const json = await res.json();
      setData({
        traffic: json.traffic || [],
        configured: json.configured ?? false,
      });
    } catch {
      // Prometheus not available — silent
    }
  }, [cluster]);

  useEffect(() => {
    fetchTraffic();
    intervalRef.current = setInterval(fetchTraffic, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTraffic]);

  useEffect(() => {
    setData({ traffic: [], configured: false });
  }, [cluster]);

  return data;
}
