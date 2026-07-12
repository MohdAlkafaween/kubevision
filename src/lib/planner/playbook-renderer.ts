import {
  type PlaybookStep,
  type InstallPhase,
  collectNamespaces,
  groupByPhase,
} from "./dependency-engine";

const PHASE_TITLES: Record<InstallPhase, string> = {
  namespace: "Namespace Creation & Prerequisites",
  config: "Secrets & ConfigMaps",
  operator: "Operator Installations & CRD Registrations",
  helm: "Helm Repository Additions & Chart Installations",
  storage: "Persistent Storage Provisioning",
  workload: "Core Workloads",
  networking: "Networking & Ingress",
  verification: "Verification & Validation",
};

const PHASE_ORDER: InstallPhase[] = [
  "namespace",
  "config",
  "operator",
  "helm",
  "storage",
  "workload",
  "networking",
  "verification",
];

function renderNamespacePhase(namespaces: string[], steps: PlaybookStep[]): string {
  const lines: string[] = [];
  const nsFromSteps = steps.filter((s) => s.kind === "Namespace");

  const allNs = new Set([...namespaces, ...nsFromSteps.map((s) => s.label)]);
  if (allNs.size === 0) return "";

  for (const ns of allNs) {
    lines.push(`kubectl create namespace ${ns} --dry-run=client -o yaml | kubectl apply -f -`);
  }

  return lines.join("\n");
}

function renderConfigStep(step: PlaybookStep): string {
  const lines: string[] = [];
  const ns = step.namespace !== "default" ? ` -n ${step.namespace}` : "";

  if (step.kind === "Secret") {
    lines.push(`# Create Secret: ${step.label}`);
    lines.push(`kubectl create secret generic ${step.label}${ns} \\`);
    lines.push(`  --from-literal=key=value  # Replace with actual secret data`);
  } else {
    lines.push(`# Create ConfigMap: ${step.label}`);
    lines.push(`kubectl create configmap ${step.label}${ns} \\`);
    lines.push(`  --from-literal=key=value  # Replace with actual config data`);
  }

  return lines.join("\n");
}

function renderHelmStep(step: PlaybookStep): string {
  const cfg = step.config;
  const lines: string[] = [];

  lines.push(`# Helm Chart: ${step.label}`);
  if (cfg.repoName && cfg.repoUrl) {
    lines.push(`helm repo add ${cfg.repoName} ${cfg.repoUrl}`);
    lines.push(`helm repo update`);
  }

  const installCmd = [
    `helm install ${cfg.releaseName || step.label}`,
    cfg.repoName && cfg.chart ? `${cfg.repoName}/${cfg.chart}` : step.label,
    `--namespace ${cfg.namespace || step.namespace || "default"}`,
    `--create-namespace`,
  ];

  const values = (cfg.values || {}) as Record<string, string>;
  for (const [k, v] of Object.entries(values)) {
    installCmd.push(`--set ${k}=${v}`);
  }

  lines.push(installCmd.join(" \\\n  "));

  return lines.join("\n");
}

function renderOperatorStep(step: PlaybookStep): string {
  if (step.kind === "HelmChart") {
    return renderHelmStep(step);
  }

  const lines: string[] = [];
  lines.push(`# Apply Operator CRD: ${step.kind}/${step.label}`);
  const ns = step.namespace !== "default" ? ` -n ${step.namespace}` : "";
  lines.push(`kubectl apply -f ${step.label}.yaml${ns}`);
  return lines.join("\n");
}

function renderStorageStep(step: PlaybookStep): string {
  const ns = step.namespace !== "default" ? ` -n ${step.namespace}` : "";
  const lines: string[] = [];
  lines.push(`# Create ${step.kind}: ${step.label}`);
  lines.push(`kubectl apply -f ${step.label}.yaml${ns}`);
  return lines.join("\n");
}

function renderWorkloadStep(step: PlaybookStep): string {
  const ns = step.namespace !== "default" ? ` -n ${step.namespace}` : "";
  const lines: string[] = [];
  lines.push(`# Deploy ${step.kind}: ${step.label}`);
  lines.push(`kubectl apply -f ${step.label}.yaml${ns}`);
  return lines.join("\n");
}

function renderNetworkingStep(step: PlaybookStep): string {
  const ns = step.namespace !== "default" ? ` -n ${step.namespace}` : "";
  const lines: string[] = [];
  lines.push(`# Create ${step.kind}: ${step.label}`);
  lines.push(`kubectl apply -f ${step.label}.yaml${ns}`);
  return lines.join("\n");
}

function renderVerificationCommands(steps: PlaybookStep[]): string {
  const lines: string[] = [];

  const deployments = steps.filter((s) =>
    ["Deployment", "StatefulSet", "DaemonSet"].includes(s.kind)
  );
  const pods = steps.filter((s) => s.kind === "Pod");
  const services = steps.filter((s) => ["Service", "LoadBalancer"].includes(s.kind));
  const helmCharts = steps.filter((s) => s.kind === "HelmChart");

  for (const d of deployments) {
    const ns = d.namespace !== "default" ? ` -n ${d.namespace}` : "";
    const waitKind = d.kind === "Deployment" ? "deployment" : d.kind.toLowerCase();
    lines.push(`kubectl rollout status ${waitKind}/${d.label}${ns} --timeout=300s`);
  }

  for (const p of pods) {
    const ns = p.namespace !== "default" ? ` -n ${p.namespace}` : "";
    lines.push(
      `kubectl wait --for=condition=Ready pod/${p.label}${ns} --timeout=120s`
    );
  }

  for (const s of services) {
    const ns = s.namespace !== "default" ? ` -n ${s.namespace}` : "";
    lines.push(`kubectl get svc ${s.label}${ns}`);
  }

  for (const h of helmCharts) {
    const ns = h.config.namespace || h.namespace || "default";
    lines.push(
      `helm status ${h.config.releaseName || h.label} -n ${ns}`
    );
  }

  if (lines.length === 0) {
    lines.push("kubectl get all -A");
  }

  return lines.join("\n");
}

export function renderPlaybook(steps: PlaybookStep[]): string {
  if (steps.length === 0) {
    return "# Installation Playbook\n\nNo resources to install. Add resources to the planning canvas first.";
  }

  const lines: string[] = [];
  const namespaces = collectNamespaces(steps);
  const grouped = groupByPhase(steps);
  let stepNum = 1;

  lines.push("# Installation Playbook");
  lines.push("");
  lines.push(`> Generated from topology with ${steps.length} resource(s)`);
  lines.push(`> ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const phase of PHASE_ORDER) {
    const phaseSteps = grouped.get(phase);

    if (phase === "namespace" && namespaces.length > 0) {
      lines.push(`## Step ${stepNum}: ${PHASE_TITLES.namespace}`);
      lines.push("");
      lines.push("```bash");
      lines.push(renderNamespacePhase(namespaces, phaseSteps || []));
      lines.push("```");
      lines.push("");
      stepNum++;
      continue;
    }

    if (phase === "verification") {
      lines.push(`## Step ${stepNum}: ${PHASE_TITLES.verification}`);
      lines.push("");
      lines.push("```bash");
      lines.push(renderVerificationCommands(steps));
      lines.push("```");
      lines.push("");
      stepNum++;
      continue;
    }

    if (!phaseSteps || phaseSteps.length === 0) continue;
    if (phase === "namespace") continue;

    lines.push(`## Step ${stepNum}: ${PHASE_TITLES[phase]}`);
    lines.push("");

    for (const step of phaseSteps) {
      let rendered: string;
      switch (phase) {
        case "config":
          rendered = renderConfigStep(step);
          break;
        case "operator":
          rendered = renderOperatorStep(step);
          break;
        case "helm":
          rendered = renderHelmStep(step);
          break;
        case "storage":
          rendered = renderStorageStep(step);
          break;
        case "workload":
          rendered = renderWorkloadStep(step);
          break;
        case "networking":
          rendered = renderNetworkingStep(step);
          break;
        default:
          rendered = `# ${step.kind}: ${step.label}`;
      }

      lines.push("```bash");
      lines.push(rendered);
      lines.push("```");
      lines.push("");
    }

    stepNum++;
  }

  return lines.join("\n");
}
