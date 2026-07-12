import type { K8sResource, K8sResourceKind, ClusterResources, ResourceStatus } from "@/types/k8s";
import { getCoreApi, getAppsApi, getNetworkingApi, getBatchApi } from "./client";

function extractStatus(kind: K8sResourceKind, obj: Record<string, unknown>): ResourceStatus {
  const status = (obj.status || {}) as Record<string, unknown>;

  switch (kind) {
    case "Pod": {
      const containerStatuses = ((status.containerStatuses || []) as Array<Record<string, unknown>>).map((cs) => ({
        name: cs.name as string,
        ready: cs.ready as boolean,
        restartCount: cs.restartCount as number,
        state: Object.keys((cs.state || {}) as Record<string, unknown>)[0] || "unknown",
        image: cs.image as string,
      }));
      const phase = (status.phase as string) || "Unknown";
      const allReady = containerStatuses.length > 0 && containerStatuses.every((c) => c.ready);
      return {
        phase,
        ready: phase === "Running" && allReady,
        restartCount: containerStatuses.reduce((sum, c) => sum + c.restartCount, 0),
        conditions: ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
          type: c.type as string,
          status: c.status as string,
          reason: c.reason as string | undefined,
          message: c.message as string | undefined,
        })),
        containerStatuses,
      };
    }
    case "Node": {
      const conditions = ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
        type: c.type as string,
        status: c.status as string,
        reason: c.reason as string | undefined,
        message: c.message as string | undefined,
      }));
      const readyCond = conditions.find((c) => c.type === "Ready");
      return {
        phase: readyCond?.status === "True" ? "Ready" : "NotReady",
        ready: readyCond?.status === "True",
        conditions,
      };
    }
    case "Deployment":
    case "StatefulSet":
    case "DaemonSet": {
      const replicas = (status.replicas as number) || 0;
      const readyReplicas = (status.readyReplicas as number) || 0;
      return {
        phase: readyReplicas === replicas && replicas > 0 ? "Available" : "Progressing",
        ready: readyReplicas === replicas && replicas > 0,
      };
    }
    case "Service":
      return { phase: "Active", ready: true };
    case "Ingress":
      return { phase: "Active", ready: true };
    default:
      return { phase: "Active", ready: true };
  }
}

function mapResource(kind: K8sResourceKind, obj: Record<string, unknown>): K8sResource {
  const meta = (obj.metadata || {}) as Record<string, unknown>;
  return {
    kind,
    name: meta.name as string,
    namespace: meta.namespace as string | undefined,
    uid: meta.uid as string,
    labels: (meta.labels || {}) as Record<string, string>,
    annotations: (meta.annotations || {}) as Record<string, string>,
    creationTimestamp: meta.creationTimestamp as string,
    status: extractStatus(kind, obj),
    raw: obj,
  };
}

export async function fetchClusterResources(contextName: string): Promise<ClusterResources> {
  const core = getCoreApi(contextName);
  const apps = getAppsApi(contextName);
  const networking = getNetworkingApi(contextName);
  const batch = getBatchApi(contextName);

  const [
    nodesRes,
    podsRes,
    servicesRes,
    namespacesRes,
    pvRes,
    pvcRes,
    configMapsRes,
    secretsRes,
    deploymentsRes,
    replicaSetsRes,
    statefulSetsRes,
    daemonSetsRes,
    ingressesRes,
    networkPoliciesRes,
    jobsRes,
    cronJobsRes,
  ] = await Promise.allSettled([
    core.listNode(),
    core.listPodForAllNamespaces(),
    core.listServiceForAllNamespaces(),
    core.listNamespace(),
    core.listPersistentVolume(),
    core.listPersistentVolumeClaimForAllNamespaces(),
    core.listConfigMapForAllNamespaces(),
    core.listSecretForAllNamespaces(),
    apps.listDeploymentForAllNamespaces(),
    apps.listReplicaSetForAllNamespaces(),
    apps.listStatefulSetForAllNamespaces(),
    apps.listDaemonSetForAllNamespaces(),
    networking.listIngressForAllNamespaces(),
    networking.listNetworkPolicyForAllNamespaces(),
    batch.listJobForAllNamespaces(),
    batch.listCronJobForAllNamespaces(),
  ]);

  const extract = (result: PromiseSettledResult<{ items: unknown[] }>, kind: K8sResourceKind): K8sResource[] => {
    if (result.status === "fulfilled") {
      return (result.value.items || []).map((item) => mapResource(kind, item as Record<string, unknown>));
    }
    return [];
  };

  return {
    nodes: extract(nodesRes as PromiseSettledResult<{ items: unknown[] }>, "Node"),
    pods: extract(podsRes as PromiseSettledResult<{ items: unknown[] }>, "Pod"),
    services: extract(servicesRes as PromiseSettledResult<{ items: unknown[] }>, "Service"),
    namespaces: extract(namespacesRes as PromiseSettledResult<{ items: unknown[] }>, "Namespace"),
    pvs: extract(pvRes as PromiseSettledResult<{ items: unknown[] }>, "PersistentVolume"),
    pvcs: extract(pvcRes as PromiseSettledResult<{ items: unknown[] }>, "PersistentVolumeClaim"),
    configMaps: extract(configMapsRes as PromiseSettledResult<{ items: unknown[] }>, "ConfigMap"),
    secrets: extract(secretsRes as PromiseSettledResult<{ items: unknown[] }>, "Secret"),
    deployments: extract(deploymentsRes as PromiseSettledResult<{ items: unknown[] }>, "Deployment"),
    replicaSets: extract(replicaSetsRes as PromiseSettledResult<{ items: unknown[] }>, "ReplicaSet"),
    statefulSets: extract(statefulSetsRes as PromiseSettledResult<{ items: unknown[] }>, "StatefulSet"),
    daemonSets: extract(daemonSetsRes as PromiseSettledResult<{ items: unknown[] }>, "DaemonSet"),
    ingresses: extract(ingressesRes as PromiseSettledResult<{ items: unknown[] }>, "Ingress"),
    networkPolicies: extract(networkPoliciesRes as PromiseSettledResult<{ items: unknown[] }>, "NetworkPolicy"),
    jobs: extract(jobsRes as PromiseSettledResult<{ items: unknown[] }>, "Job"),
    cronJobs: extract(cronJobsRes as PromiseSettledResult<{ items: unknown[] }>, "CronJob"),
  };
}
