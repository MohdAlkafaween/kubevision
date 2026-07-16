"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClusterContext, ClusterResources } from "@/types/k8s";

export function useClusters() {
  const [contexts, setContexts] = useState<ClusterContext[]>([]);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clusters")
      .then((res) => res.json())
      .then((data) => {
        setContexts(data.contexts || []);
        const current = data.contexts?.find((c: ClusterContext) => c.isCurrent);
        if (current) setActiveCluster(current.name);
        setError(data.error || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { contexts, activeCluster, setActiveCluster, loading, error };
}

export function useResources(cluster: string | null) {
  const [resources, setResources] = useState<ClusterResources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/resources/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResources(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return { resources, loading, error, refetch: fetchResources };
}

export function useResourceStream(cluster: string | null) {
  const [events, setEvents] = useState<Array<{ type: string; resource: { kind: string; name: string; namespace?: string; [key: string]: unknown }; timestamp: string }>>([]);

  useEffect(() => {
    if (!cluster) return;

    const eventSource = new EventSource(`/api/stream/${encodeURIComponent(cluster)}`);

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (!event.error) {
          setEvents((prev) => [event, ...prev].slice(0, 200));
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => eventSource.close();
  }, [cluster]);

  return events;
}
