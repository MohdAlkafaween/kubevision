import type { ClusterResources, K8sResource } from "@/types/k8s";

interface ResourceRelation {
  sourceUid: string;
  targetUid: string;
  type: "service" | "ingress" | "storage" | "owner" | "network";
}

function matchesSelector(
  podLabels: Record<string, string>,
  selector: Record<string, string>
): boolean {
  return Object.entries(selector).every(
    ([key, value]) => podLabels[key] === value
  );
}

export function mapRelationships(resources: ClusterResources): ResourceRelation[] {
  const relations: ResourceRelation[] = [];

  for (const svc of resources.services) {
    const raw = svc.raw as Record<string, unknown>;
    const spec = (raw.spec || {}) as Record<string, unknown>;
    const selector = (spec.selector || {}) as Record<string, string>;

    if (Object.keys(selector).length === 0) continue;

    for (const pod of resources.pods) {
      if (svc.namespace && pod.namespace !== svc.namespace) continue;
      if (matchesSelector(pod.labels, selector)) {
        relations.push({
          sourceUid: svc.uid,
          targetUid: pod.uid,
          type: "service",
        });
      }
    }
  }

  for (const ing of resources.ingresses) {
    const raw = ing.raw as Record<string, unknown>;
    const spec = (raw.spec || {}) as Record<string, unknown>;
    const rules = (spec.rules || []) as Array<Record<string, unknown>>;

    for (const rule of rules) {
      const http = (rule.http || {}) as Record<string, unknown>;
      const paths = (http.paths || []) as Array<Record<string, unknown>>;

      for (const path of paths) {
        const backend = (path.backend || {}) as Record<string, unknown>;
        const service = (backend.service || {}) as Record<string, unknown>;
        const serviceName = service.name as string;

        if (serviceName) {
          const targetSvc = resources.services.find(
            (s) => s.name === serviceName && s.namespace === ing.namespace
          );
          if (targetSvc) {
            relations.push({
              sourceUid: ing.uid,
              targetUid: targetSvc.uid,
              type: "ingress",
            });
          }
        }
      }
    }
  }

  for (const pod of resources.pods) {
    const raw = pod.raw as Record<string, unknown>;
    const spec = (raw.spec || {}) as Record<string, unknown>;
    const volumes = (spec.volumes || []) as Array<Record<string, unknown>>;

    for (const vol of volumes) {
      const pvcClaim = vol.persistentVolumeClaim as Record<string, unknown> | undefined;
      if (pvcClaim) {
        const claimName = pvcClaim.claimName as string;
        const pvc = resources.pvcs.find(
          (p) => p.name === claimName && p.namespace === pod.namespace
        );
        if (pvc) {
          relations.push({
            sourceUid: pod.uid,
            targetUid: pvc.uid,
            type: "storage",
          });
        }
      }
    }
  }

  for (const pvc of resources.pvcs) {
    const raw = pvc.raw as Record<string, unknown>;
    const spec = (raw.spec || {}) as Record<string, unknown>;
    const volumeName = spec.volumeName as string | undefined;

    if (volumeName) {
      const pv = resources.pvs.find((p) => p.name === volumeName);
      if (pv) {
        relations.push({
          sourceUid: pvc.uid,
          targetUid: pv.uid,
          type: "storage",
        });
      }
    }
  }

  const ownerMap = new Map<string, K8sResource>();
  const allResources = [
    ...resources.deployments,
    ...resources.replicaSets,
    ...resources.statefulSets,
    ...resources.daemonSets,
    ...resources.jobs,
    ...resources.cronJobs,
  ];
  for (const r of allResources) ownerMap.set(r.uid, r);

  for (const pod of resources.pods) {
    const raw = pod.raw as Record<string, unknown>;
    const meta = (raw.metadata || {}) as Record<string, unknown>;
    const owners = (meta.ownerReferences || []) as Array<Record<string, unknown>>;

    for (const owner of owners) {
      const ownerUid = owner.uid as string;
      if (ownerMap.has(ownerUid)) {
        relations.push({
          sourceUid: ownerUid,
          targetUid: pod.uid,
          type: "owner",
        });
      }
    }
  }

  for (const rs of resources.replicaSets) {
    const raw = rs.raw as Record<string, unknown>;
    const meta = (raw.metadata || {}) as Record<string, unknown>;
    const owners = (meta.ownerReferences || []) as Array<Record<string, unknown>>;

    for (const owner of owners) {
      const ownerUid = owner.uid as string;
      if (ownerMap.has(ownerUid)) {
        relations.push({
          sourceUid: ownerUid,
          targetUid: rs.uid,
          type: "owner",
        });
      }
    }
  }

  const tailscaleNodes = resources.pods.filter((p) => {
    const name = p.name.toLowerCase();
    const appLabel = (p.labels["app"] || p.labels["app.kubernetes.io/name"] || "").toLowerCase();
    return name.includes("tailscale") || appLabel.includes("tailscale");
  });

  if (tailscaleNodes.length > 0) {
    const nodeUids = resources.nodes.map((n) => n.uid);
    for (let i = 0; i < nodeUids.length; i++) {
      for (let j = i + 1; j < nodeUids.length; j++) {
        relations.push({
          sourceUid: nodeUids[i],
          targetUid: nodeUids[j],
          type: "network",
        });
      }
    }
  }

  return relations;
}
