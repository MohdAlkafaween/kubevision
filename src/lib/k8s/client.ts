import * as k8s from "@kubernetes/client-node";
import type { ClusterContext } from "@/types/k8s";

const clients = new Map<string, k8s.KubeConfig>();

function loadKubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc;
}

export function getClusterContexts(): ClusterContext[] {
  const kc = loadKubeConfig();
  const currentContext = kc.getCurrentContext();

  return kc.getContexts().map((ctx) => ({
    name: ctx.name,
    cluster: ctx.cluster,
    user: ctx.user,
    namespace: ctx.namespace || undefined,
    isCurrent: ctx.name === currentContext,
  }));
}

export function getKubeConfig(contextName: string): k8s.KubeConfig {
  const kc = loadKubeConfig();
  kc.setCurrentContext(contextName);
  clients.set(contextName, kc);
  return kc;
}

export function getCoreApi(contextName: string): k8s.CoreV1Api {
  const kc = getKubeConfig(contextName);
  return kc.makeApiClient(k8s.CoreV1Api);
}

export function getAppsApi(contextName: string): k8s.AppsV1Api {
  const kc = getKubeConfig(contextName);
  return kc.makeApiClient(k8s.AppsV1Api);
}

export function getNetworkingApi(contextName: string): k8s.NetworkingV1Api {
  const kc = getKubeConfig(contextName);
  return kc.makeApiClient(k8s.NetworkingV1Api);
}

export function getBatchApi(contextName: string): k8s.BatchV1Api {
  const kc = getKubeConfig(contextName);
  return kc.makeApiClient(k8s.BatchV1Api);
}

export function getRbacApi(
  contextName: string
): k8s.RbacAuthorizationV1Api {
  const kc = getKubeConfig(contextName);
  return kc.makeApiClient(k8s.RbacAuthorizationV1Api);
}

export function getMetricsClient(
  contextName: string
): k8s.Metrics {
  const kc = getKubeConfig(contextName);
  return new k8s.Metrics(kc);
}

export function clearClientCache(contextName?: string) {
  if (contextName) {
    clients.delete(contextName);
  } else {
    clients.clear();
  }
}
