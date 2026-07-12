export interface OperatorCRD {
  group: string;
  version: string;
  kind: string;
  plural: string;
  operator: string;
  icon: string;
  badge: string;
  badgeColor: string;
  statusExtractor: (raw: Record<string, unknown>) => {
    phase: string;
    ready: boolean;
    details: Record<string, string>;
  };
}

function extractGenericStatus(raw: Record<string, unknown>) {
  const status = (raw.status || {}) as Record<string, unknown>;
  const phase = (status.phase as string) || (status.state as string) || "Unknown";
  const conditions = (status.conditions || []) as Array<Record<string, string>>;
  const readyCondition = conditions.find((c) => c.type === "Ready" || c.type === "Available");
  return {
    phase,
    ready: readyCondition?.status === "True" || phase === "Ready" || phase === "green",
    details: {} as Record<string, string>,
  };
}

export const OPERATOR_CRDS: OperatorCRD[] = [
  // ECK Operator
  {
    group: "elasticsearch.k8s.elastic.co",
    version: "v1",
    kind: "Elasticsearch",
    plural: "elasticsearches",
    operator: "ECK",
    icon: "🔍",
    badge: "ES",
    badgeColor: "bg-[#FEC514]/20 text-[#FEC514] border-[#FEC514]/40",
    statusExtractor: (raw) => {
      const status = (raw.status || {}) as Record<string, unknown>;
      const health = (status.health as string) || "unknown";
      const phase = (status.phase as string) || health;
      const availableNodes = status.availableNodes as number | undefined;
      return {
        phase: health,
        ready: health === "green",
        details: {
          health,
          phase,
          ...(availableNodes !== undefined ? { availableNodes: String(availableNodes) } : {}),
          version: (status.version as string) || "",
        },
      };
    },
  },
  {
    group: "kibana.k8s.elastic.co",
    version: "v1",
    kind: "Kibana",
    plural: "kibanas",
    operator: "ECK",
    icon: "📊",
    badge: "KB",
    badgeColor: "bg-[#F04E98]/20 text-[#F04E98] border-[#F04E98]/40",
    statusExtractor: (raw) => {
      const status = (raw.status || {}) as Record<string, unknown>;
      const health = (status.health as string) || "unknown";
      return {
        phase: health,
        ready: health === "green",
        details: { health, version: (status.version as string) || "" },
      };
    },
  },
  // Prometheus Operator
  {
    group: "monitoring.coreos.com",
    version: "v1",
    kind: "Prometheus",
    plural: "prometheuses",
    operator: "Prometheus",
    icon: "🔥",
    badge: "PROM",
    badgeColor: "bg-[#E6522C]/20 text-[#E6522C] border-[#E6522C]/40",
    statusExtractor: (raw) => {
      const status = (raw.status || {}) as Record<string, unknown>;
      const replicas = (status.availableReplicas as number) || 0;
      const desired = ((raw.spec || {}) as Record<string, unknown>).replicas as number || 1;
      return {
        phase: replicas >= desired ? "Running" : "Degraded",
        ready: replicas >= desired,
        details: { replicas: `${replicas}/${desired}` },
      };
    },
  },
  {
    group: "monitoring.coreos.com",
    version: "v1",
    kind: "ServiceMonitor",
    plural: "servicemonitors",
    operator: "Prometheus",
    icon: "📡",
    badge: "SM",
    badgeColor: "bg-[#E6522C]/20 text-[#E6522C] border-[#E6522C]/40",
    statusExtractor: extractGenericStatus,
  },
  {
    group: "monitoring.coreos.com",
    version: "v1",
    kind: "Alertmanager",
    plural: "alertmanagers",
    operator: "Prometheus",
    icon: "🔔",
    badge: "AM",
    badgeColor: "bg-[#E6522C]/20 text-[#E6522C] border-[#E6522C]/40",
    statusExtractor: (raw) => {
      const status = (raw.status || {}) as Record<string, unknown>;
      const replicas = (status.availableReplicas as number) || 0;
      return {
        phase: replicas > 0 ? "Running" : "Pending",
        ready: replicas > 0,
        details: { replicas: String(replicas) },
      };
    },
  },
  // Cert-Manager
  {
    group: "cert-manager.io",
    version: "v1",
    kind: "Certificate",
    plural: "certificates",
    operator: "Cert-Manager",
    icon: "🔒",
    badge: "CERT",
    badgeColor: "bg-[#00C7B7]/20 text-[#00C7B7] border-[#00C7B7]/40",
    statusExtractor: (raw) => {
      const status = (raw.status || {}) as Record<string, unknown>;
      const conditions = (status.conditions || []) as Array<Record<string, string>>;
      const readyCond = conditions.find((c) => c.type === "Ready");
      const notAfter = status.notAfter as string | undefined;
      return {
        phase: readyCond?.status === "True" ? "Ready" : "NotReady",
        ready: readyCond?.status === "True",
        details: {
          ...(notAfter ? { expires: notAfter } : {}),
          ...(readyCond?.reason ? { reason: readyCond.reason } : {}),
        },
      };
    },
  },
  {
    group: "cert-manager.io",
    version: "v1",
    kind: "Issuer",
    plural: "issuers",
    operator: "Cert-Manager",
    icon: "🏛️",
    badge: "ISS",
    badgeColor: "bg-[#00C7B7]/20 text-[#00C7B7] border-[#00C7B7]/40",
    statusExtractor: extractGenericStatus,
  },
  {
    group: "cert-manager.io",
    version: "v1",
    kind: "ClusterIssuer",
    plural: "clusterissuers",
    operator: "Cert-Manager",
    icon: "🏛️",
    badge: "CISS",
    badgeColor: "bg-[#00C7B7]/20 text-[#00C7B7] border-[#00C7B7]/40",
    statusExtractor: extractGenericStatus,
  },
];

export function findOperatorCRD(kind: string): OperatorCRD | undefined {
  return OPERATOR_CRDS.find((c) => c.kind === kind);
}

export function getOperatorBadge(labels: Record<string, string>): { badge: string; color: string } | null {
  const managedBy = labels["app.kubernetes.io/part-of"] || "";
  if (managedBy.includes("prometheus")) return { badge: "PROM", color: "bg-[#E6522C]/20 text-[#E6522C] border-[#E6522C]/40" };
  if (managedBy.includes("cert-manager")) return { badge: "CM", color: "bg-[#00C7B7]/20 text-[#00C7B7] border-[#00C7B7]/40" };
  return null;
}
