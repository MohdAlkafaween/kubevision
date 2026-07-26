import { loadAll, dump } from "js-yaml";

interface ParsedResource {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
}

const KIND_ORDER: Record<string, number> = {
  Namespace: 0,
  ResourceQuota: 1,
  LimitRange: 2,
  ServiceAccount: 3,
  Secret: 4,
  ConfigMap: 5,
  PersistentVolume: 6,
  PersistentVolumeClaim: 7,
  ClusterRole: 8,
  Role: 9,
  ClusterRoleBinding: 10,
  RoleBinding: 11,
  NetworkPolicy: 12,
  Service: 13,
  DaemonSet: 14,
  Deployment: 15,
  StatefulSet: 16,
  Job: 17,
  CronJob: 18,
  Ingress: 19,
  HorizontalPodAutoscaler: 20,
  PodDisruptionBudget: 21,
};

function parseResources(yamlText: string): ParsedResource[] {
  try {
    const docs = loadAll(yamlText) as unknown[];
    return docs
      .filter((d): d is Record<string, unknown> => d !== null && typeof d === "object")
      .map((doc) => {
        const meta = doc.metadata as Record<string, unknown> | undefined;
        return {
          apiVersion: (doc.apiVersion as string) || "",
          kind: (doc.kind as string) || "",
          name: (meta?.name as string) || "unnamed",
          namespace: meta?.namespace as string | undefined,
        };
      })
      .filter((r) => r.kind);
  } catch {
    return [];
  }
}

export interface GeneratedCommand {
  label: string;
  command: string;
  description: string;
  order: number;
}

export function generateApplyCommands(yamlText: string, fileName?: string): GeneratedCommand[] {
  const resources = parseResources(yamlText);
  if (resources.length === 0) return [];

  const commands: GeneratedCommand[] = [];
  const fn = fileName || "config.yaml";

  if (resources.length === 1) {
    const r = resources[0];
    const nsFlag = r.namespace ? ` -n ${r.namespace}` : "";
    commands.push({
      label: `Apply ${r.kind}/${r.name}`,
      command: `kubectl apply -f ${fn}${nsFlag}`,
      description: `Create or update ${r.kind} "${r.name}"`,
      order: KIND_ORDER[r.kind] ?? 99,
    });
  } else {
    commands.push({
      label: `Apply all resources`,
      command: `kubectl apply -f ${fn}`,
      description: `Apply all ${resources.length} resources from ${fn}`,
      order: 0,
    });
  }

  return commands;
}

export function generateSequencedCommands(yamlText: string): GeneratedCommand[] {
  const resources = parseResources(yamlText);
  if (resources.length <= 1) return generateApplyCommands(yamlText);

  const sorted = [...resources].sort((a, b) => {
    const ao = KIND_ORDER[a.kind] ?? 99;
    const bo = KIND_ORDER[b.kind] ?? 99;
    return ao - bo;
  });

  const commands: GeneratedCommand[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const nsFlag = r.namespace ? ` -n ${r.namespace}` : "";

    if (r.kind === "Namespace") {
      commands.push({
        label: `${i + 1}. Create Namespace`,
        command: `kubectl create namespace ${r.name} --dry-run=client -o yaml | kubectl apply -f -`,
        description: `Ensure namespace "${r.name}" exists`,
        order: i,
      });
    } else {
      commands.push({
        label: `${i + 1}. Apply ${r.kind}/${r.name}`,
        command: `cat <<'EOF' | kubectl apply${nsFlag} -f -\n${extractDocYaml(yamlText, r)}\nEOF`,
        description: `Apply ${r.kind} "${r.name}"${r.namespace ? ` in ${r.namespace}` : ""}`,
        order: i,
      });
    }
  }

  return commands;
}

function extractDocYaml(fullYaml: string, resource: ParsedResource): string {
  try {
    const docs = loadAll(fullYaml) as unknown[];
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") continue;
      const d = doc as Record<string, unknown>;
      const meta = d.metadata as Record<string, unknown> | undefined;
      if (d.kind === resource.kind && meta?.name === resource.name) {
        return dump(d, { indent: 2, lineWidth: -1 }).trim();
      }
    }
  } catch {}
  return fullYaml;
}

export function generateDryRunCommand(yamlText: string, fileName?: string): GeneratedCommand {
  const fn = fileName || "config.yaml";
  return {
    label: "Dry-run (server-side)",
    command: `kubectl apply -f ${fn} --dry-run=server`,
    description: "Validate against the cluster without applying",
    order: -1,
  };
}

export function generateDiffCommand(yamlText: string, fileName?: string): GeneratedCommand {
  const fn = fileName || "config.yaml";
  return {
    label: "Diff against live",
    command: `kubectl diff -f ${fn}`,
    description: "Show what would change compared to the live cluster state",
    order: -2,
  };
}

export function generateDeleteCommands(yamlText: string): GeneratedCommand[] {
  const resources = parseResources(yamlText);
  const reversed = [...resources].sort((a, b) => {
    const ao = KIND_ORDER[a.kind] ?? 99;
    const bo = KIND_ORDER[b.kind] ?? 99;
    return bo - ao;
  });

  return reversed.map((r, i) => {
    const nsFlag = r.namespace ? ` -n ${r.namespace}` : "";
    return {
      label: `${i + 1}. Delete ${r.kind}/${r.name}`,
      command: `kubectl delete ${r.kind.toLowerCase()} ${r.name}${nsFlag}`,
      description: `Remove ${r.kind} "${r.name}"`,
      order: i,
    };
  });
}
