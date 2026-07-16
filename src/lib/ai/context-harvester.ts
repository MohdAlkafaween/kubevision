import type { ClusterResources, K8sResource } from "@/types/k8s";

export interface AiContext {
  systemPrompt: string;
  contextSummary: string;
}

function findUnhealthyPods(resources: ClusterResources | null): K8sResource[] {
  if (!resources) return [];
  return resources.pods.filter((p) => {
    const phase = p.status.phase;
    return (
      phase === "Failed" ||
      phase === "CrashLoopBackOff" ||
      phase === "Error" ||
      phase === "Pending" ||
      phase === "ImagePullBackOff" ||
      phase === "ErrImagePull"
    );
  });
}

function findRecentEvents(
  events: Array<{ type: string; resource: { kind: string; name: string; namespace?: string; [key: string]: unknown }; timestamp: string }>,
  limit = 10
): string {
  const recent = events
    .filter((e) => e.type === "DELETED" || e.type === "MODIFIED")
    .slice(0, limit);
  if (recent.length === 0) return "No recent resource changes.";
  return recent
    .map((e) => `[${e.type}] ${e.resource.kind}/${e.resource.name}${e.resource.namespace ? ` in ${e.resource.namespace}` : ""}`)
    .join("\n");
}

export function harvestDashboardContext(
  resources: ClusterResources | null,
  events: Array<{ type: string; resource: { kind: string; name: string; namespace?: string; [key: string]: unknown }; timestamp: string }>,
  cluster: string | null
): AiContext {
  const unhealthy = findUnhealthyPods(resources);
  const warningEvents = findRecentEvents(events);

  const podSummary = resources
    ? `Total pods: ${resources.pods.length}, Unhealthy: ${unhealthy.length}`
    : "No resources loaded";

  const unhealthyDetails = unhealthy
    .slice(0, 5)
    .map((p) => `- ${p.namespace}/${p.name}: ${p.status}`)
    .join("\n");

  const contextSummary = [
    `Cluster: ${cluster || "unknown"}`,
    podSummary,
    unhealthy.length > 0 ? `Unhealthy pods:\n${unhealthyDetails}` : "",
    `Recent warnings:\n${warningEvents}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: `You are KubeVision AI, a Kubernetes troubleshooting assistant. You have access to the following live cluster context. Use it to diagnose issues, suggest fixes, and answer questions about the cluster state. Be concise and actionable. Format commands in code blocks.

## Active Cluster Context
${contextSummary}`,
    contextSummary,
  };
}

export function harvestPlannerContext(
  nodesJson: string,
  planName: string
): AiContext {
  const contextSummary = [
    `Plan: ${planName}`,
    `Topology JSON:\n${nodesJson}`,
  ].join("\n\n");

  return {
    systemPrompt: `You are KubeVision AI, a Kubernetes architecture planning assistant. The user is designing a deployment topology. Review their plan, suggest improvements, identify missing dependencies, and help validate the architecture. Be concise and actionable. Format commands in code blocks.

## Active Plan Context
${contextSummary}`,
    contextSummary,
  };
}

export function harvestResourceContext(
  resource: K8sResource
): AiContext {
  const raw = resource.raw as Record<string, unknown>;
  const statusSection = raw?.status
    ? JSON.stringify(raw.status, null, 2).slice(0, 2000)
    : "No status available";

  const contextSummary = [
    `Resource: ${resource.kind}/${resource.name}`,
    `Namespace: ${resource.namespace || "cluster-scoped"}`,
    `Status: ${resource.status}`,
    `Status details:\n${statusSection}`,
  ].join("\n\n");

  return {
    systemPrompt: `You are KubeVision AI, a Kubernetes troubleshooting assistant. The user is inspecting a specific resource. Help them understand its state, diagnose issues, and suggest actions. Be concise and actionable. Format commands in code blocks.

## Selected Resource Context
${contextSummary}`,
    contextSummary,
  };
}
