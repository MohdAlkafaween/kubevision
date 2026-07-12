import type { PrometheusQueryResult, PrometheusRangeResult, ServiceTraffic } from "@/types/metrics";

export class PrometheusClient {
  constructor(private baseUrl: string) {}

  async query(promql: string): Promise<PrometheusQueryResult[]> {
    const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Prometheus query failed: ${res.statusText}`);
    const data = await res.json();
    if (data.status !== "success") throw new Error(`Prometheus error: ${data.error}`);
    return data.data.result;
  }

  async queryRange(
    promql: string,
    start: number,
    end: number,
    step: string
  ): Promise<PrometheusRangeResult[]> {
    const params = new URLSearchParams({
      query: promql,
      start: start.toString(),
      end: end.toString(),
      step,
    });
    const url = `${this.baseUrl}/api/v1/query_range?${params}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Prometheus range query failed: ${res.statusText}`);
    const data = await res.json();
    if (data.status !== "success") throw new Error(`Prometheus error: ${data.error}`);
    return data.data.result;
  }

  async getServiceTraffic(): Promise<ServiceTraffic[]> {
    const [rateResults, latencyResults, errorResults] = await Promise.allSettled([
      this.query('sum(rate(http_requests_total[5m])) by (service, destination_service)'),
      this.query('histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service, destination_service))'),
      this.query('sum(rate(http_requests_total{code=~"5.."}[5m])) by (service, destination_service)'),
    ]);

    const rates = rateResults.status === "fulfilled" ? rateResults.value : [];
    const trafficMap = new Map<string, ServiceTraffic>();

    for (const r of rates) {
      const key = `${r.metric.service}->${r.metric.destination_service}`;
      trafficMap.set(key, {
        source: r.metric.service || "unknown",
        destination: r.metric.destination_service || "unknown",
        requestsPerSec: parseFloat(r.value[1]),
        latencyP95Ms: 0,
        errorRate: 0,
      });
    }

    if (latencyResults.status === "fulfilled") {
      for (const r of latencyResults.value) {
        const key = `${r.metric.service}->${r.metric.destination_service}`;
        const entry = trafficMap.get(key);
        if (entry) entry.latencyP95Ms = parseFloat(r.value[1]) * 1000;
      }
    }

    if (errorResults.status === "fulfilled") {
      for (const r of errorResults.value) {
        const key = `${r.metric.service}->${r.metric.destination_service}`;
        const entry = trafficMap.get(key);
        if (entry && entry.requestsPerSec > 0) {
          entry.errorRate = parseFloat(r.value[1]) / entry.requestsPerSec;
        }
      }
    }

    return Array.from(trafficMap.values());
  }

  async getResourceMetrics() {
    const [cpuResults, memResults] = await Promise.allSettled([
      this.query('sum(rate(container_cpu_usage_seconds_total[5m])) by (pod, namespace)'),
      this.query('sum(container_memory_working_set_bytes) by (pod, namespace)'),
    ]);

    const metrics = new Map<string, { cpu: number; memory: number; namespace: string }>();

    if (cpuResults.status === "fulfilled") {
      for (const r of cpuResults.value) {
        metrics.set(r.metric.pod, {
          cpu: parseFloat(r.value[1]),
          memory: 0,
          namespace: r.metric.namespace,
        });
      }
    }

    if (memResults.status === "fulfilled") {
      for (const r of memResults.value) {
        const existing = metrics.get(r.metric.pod);
        if (existing) {
          existing.memory = parseFloat(r.value[1]);
        } else {
          metrics.set(r.metric.pod, {
            cpu: 0,
            memory: parseFloat(r.value[1]),
            namespace: r.metric.namespace,
          });
        }
      }
    }

    return metrics;
  }
}
