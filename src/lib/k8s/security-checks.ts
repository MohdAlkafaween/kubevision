import type { ClusterResources, K8sResource } from "@/types/k8s";

export interface SecurityFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  resource?: string;
  namespace?: string;
  category: string;
}

export interface SecurityPosture {
  score: number;
  grade: string;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export function analyzeSecurityPosture(resources: ClusterResources): SecurityPosture {
  const findings: SecurityFinding[] = [];

  checkPrivilegedContainers(resources.pods, findings);
  checkHostNetwork(resources.pods, findings);
  checkResourceLimits(resources.pods, findings);
  checkHealthProbes(resources.pods, findings);
  checkDefaultServiceAccount(resources.pods, findings);
  checkRunAsRoot(resources.pods, findings);
  checkNetworkPolicies(resources, findings);
  checkSecrets(resources.secrets, findings);
  checkImagePullPolicy(resources.pods, findings);
  checkReadOnlyRootFs(resources.pods, findings);

  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  const total = findings.length || 1;
  const penalty =
    summary.critical * 20 + summary.high * 10 + summary.medium * 4 + summary.low * 1;
  const score = Math.max(0, Math.min(100, 100 - Math.round((penalty / total) * 10)));

  const grade =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return { score, grade, findings, summary };
}

function checkPrivilegedContainers(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { containers?: Array<{ name: string; securityContext?: { privileged?: boolean } }> } };
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      if (c.securityContext?.privileged) {
        findings.push({
          id: `priv-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "critical",
          title: "Privileged container",
          description: `Container "${c.name}" runs in privileged mode`,
          resource: `${pod.name}`,
          namespace: pod.namespace,
          category: "Container Security",
        });
      }
    }
  }
}

function checkHostNetwork(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { hostNetwork?: boolean; hostPID?: boolean; hostIPC?: boolean } };
    if (raw?.spec?.hostNetwork) {
      findings.push({
        id: `hostnet-${pod.namespace}-${pod.name}`,
        severity: "high",
        title: "Host network enabled",
        description: "Pod uses host network namespace",
        resource: pod.name,
        namespace: pod.namespace,
        category: "Network Security",
      });
    }
    if (raw?.spec?.hostPID) {
      findings.push({
        id: `hostpid-${pod.namespace}-${pod.name}`,
        severity: "high",
        title: "Host PID enabled",
        description: "Pod uses host PID namespace",
        resource: pod.name,
        namespace: pod.namespace,
        category: "Container Security",
      });
    }
  }
}

function checkResourceLimits(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { containers?: Array<{ name: string; resources?: { limits?: Record<string, string> } }> } };
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      if (!c.resources?.limits?.cpu || !c.resources?.limits?.memory) {
        findings.push({
          id: `nolimit-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "medium",
          title: "Missing resource limits",
          description: `Container "${c.name}" has no CPU/memory limits`,
          resource: pod.name,
          namespace: pod.namespace,
          category: "Resource Management",
        });
      }
    }
  }
}

function checkHealthProbes(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { containers?: Array<{ name: string; livenessProbe?: unknown; readinessProbe?: unknown }> } };
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      if (!c.livenessProbe && !c.readinessProbe) {
        findings.push({
          id: `noprobe-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "medium",
          title: "Missing health probes",
          description: `Container "${c.name}" has no liveness or readiness probes`,
          resource: pod.name,
          namespace: pod.namespace,
          category: "Reliability",
        });
      }
    }
  }
}

function checkDefaultServiceAccount(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { serviceAccountName?: string; automountServiceAccountToken?: boolean } };
    if (
      raw?.spec?.serviceAccountName === "default" &&
      raw?.spec?.automountServiceAccountToken !== false
    ) {
      findings.push({
        id: `defsa-${pod.namespace}-${pod.name}`,
        severity: "low",
        title: "Default service account with auto-mount",
        description: "Pod uses default SA with token auto-mount",
        resource: pod.name,
        namespace: pod.namespace,
        category: "Access Control",
      });
    }
  }
}

function checkRunAsRoot(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { securityContext?: { runAsNonRoot?: boolean }; containers?: Array<{ name: string; securityContext?: { runAsNonRoot?: boolean; runAsUser?: number } }> } };
    const podLevel = raw?.spec?.securityContext?.runAsNonRoot;
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      const containerLevel = c.securityContext?.runAsNonRoot;
      const runAsUser = c.securityContext?.runAsUser;
      if (!podLevel && !containerLevel && runAsUser !== undefined && runAsUser === 0) {
        findings.push({
          id: `root-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "high",
          title: "Running as root",
          description: `Container "${c.name}" runs as UID 0`,
          resource: pod.name,
          namespace: pod.namespace,
          category: "Container Security",
        });
      }
    }
  }
}

function checkNetworkPolicies(resources: ClusterResources, findings: SecurityFinding[]) {
  const nsWithPolicies = new Set(
    resources.networkPolicies.map((np) => np.namespace)
  );
  const nsWithPods = new Set(resources.pods.map((p) => p.namespace));

  for (const ns of nsWithPods) {
    if (ns && !nsWithPolicies.has(ns) && ns !== "kube-system" && ns !== "kube-public") {
      findings.push({
        id: `nonetpol-${ns}`,
        severity: "medium",
        title: "No network policies",
        description: `Namespace "${ns}" has no network policies`,
        resource: ns,
        namespace: ns,
        category: "Network Security",
      });
    }
  }
}

function checkSecrets(secrets: K8sResource[], findings: SecurityFinding[]) {
  for (const secret of secrets) {
    const raw = secret.raw as { type?: string };
    if (raw?.type === "Opaque") {
      const annotations = secret.annotations || {};
      if (
        Object.keys(annotations).some(
          (k) => k.includes("password") || k.includes("token") || k.includes("key")
        )
      ) {
        findings.push({
          id: `secret-${secret.namespace}-${secret.name}`,
          severity: "low",
          title: "Sensitive secret detected",
          description: `Secret "${secret.name}" may contain credentials`,
          resource: secret.name,
          namespace: secret.namespace,
          category: "Data Protection",
        });
      }
    }
  }
}

function checkImagePullPolicy(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { containers?: Array<{ name: string; image?: string; imagePullPolicy?: string }> } };
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      if (c.image?.endsWith(":latest") || (!c.image?.includes(":") && c.imagePullPolicy !== "Always")) {
        findings.push({
          id: `latest-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "low",
          title: "Using :latest tag",
          description: `Container "${c.name}" uses :latest or untagged image`,
          resource: pod.name,
          namespace: pod.namespace,
          category: "Image Security",
        });
      }
    }
  }
}

function checkReadOnlyRootFs(pods: K8sResource[], findings: SecurityFinding[]) {
  for (const pod of pods) {
    const raw = pod.raw as { spec?: { containers?: Array<{ name: string; securityContext?: { readOnlyRootFilesystem?: boolean } }> } };
    const containers = raw?.spec?.containers || [];
    for (const c of containers) {
      if (!c.securityContext?.readOnlyRootFilesystem) {
        findings.push({
          id: `rwroot-${pod.namespace}-${pod.name}-${c.name}`,
          severity: "low",
          title: "Writable root filesystem",
          description: `Container "${c.name}" has writable root filesystem`,
          resource: pod.name,
          namespace: pod.namespace,
          category: "Container Security",
        });
      }
    }
  }
}
