import * as k8s from "@kubernetes/client-node";
import { getKubeConfig } from "./client";
import type { K8sEvent, K8sResource, K8sResourceKind } from "@/types/k8s";

type WatchCallback = (event: K8sEvent) => void;

interface WatchHandle {
  abort: () => void;
}

function toK8sResource(kind: K8sResourceKind, obj: Record<string, unknown>): K8sResource {
  const meta = (obj.metadata || {}) as Record<string, unknown>;
  return {
    kind,
    name: (meta.name as string) || "",
    namespace: meta.namespace as string | undefined,
    uid: (meta.uid as string) || "",
    labels: (meta.labels || {}) as Record<string, string>,
    annotations: (meta.annotations || {}) as Record<string, string>,
    creationTimestamp: (meta.creationTimestamp as string) || "",
    status: { phase: "Unknown", ready: false },
    raw: obj,
  };
}

export async function watchResource(
  contextName: string,
  kind: K8sResourceKind,
  callback: WatchCallback
): Promise<WatchHandle> {
  const kc = getKubeConfig(contextName);
  const watch = new k8s.Watch(kc);

  const pathMap: Record<string, string> = {
    Node: "/api/v1/nodes",
    Pod: "/api/v1/pods",
    Service: "/api/v1/services",
    Namespace: "/api/v1/namespaces",
    PersistentVolume: "/api/v1/persistentvolumes",
    PersistentVolumeClaim: "/api/v1/persistentvolumeclaims",
    ConfigMap: "/api/v1/configmaps",
    Secret: "/api/v1/secrets",
    Deployment: "/apis/apps/v1/deployments",
    ReplicaSet: "/apis/apps/v1/replicasets",
    StatefulSet: "/apis/apps/v1/statefulsets",
    DaemonSet: "/apis/apps/v1/daemonsets",
    Ingress: "/apis/networking.k8s.io/v1/ingresses",
    NetworkPolicy: "/apis/networking.k8s.io/v1/networkpolicies",
    Job: "/apis/batch/v1/jobs",
    CronJob: "/apis/batch/v1/cronjobs",
  };

  const path = pathMap[kind];
  if (!path) throw new Error(`Unknown resource kind: ${kind}`);

  const abortController = new AbortController();

  watch.watch(
    path,
    {},
    (type: string, apiObj: Record<string, unknown>) => {
      callback({
        type: type as K8sEvent["type"],
        resource: toK8sResource(kind, apiObj),
        timestamp: new Date().toISOString(),
      });
    },
    (err: unknown) => {
      if (err && !abortController.signal.aborted) {
        console.error(`Watch error for ${kind}:`, err);
      }
    }
  );

  return {
    abort: () => abortController.abort(),
  };
}

export async function watchAllResources(
  contextName: string,
  callback: WatchCallback
): Promise<WatchHandle[]> {
  const kinds: K8sResourceKind[] = [
    "Node", "Pod", "Service", "Deployment", "ReplicaSet",
    "StatefulSet", "DaemonSet", "Ingress", "Namespace",
  ];

  const handles = await Promise.all(
    kinds.map((kind) => watchResource(contextName, kind, callback))
  );

  return handles;
}
