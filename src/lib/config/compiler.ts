import { load, loadAll, dump, YAMLException } from "js-yaml";
import {
  K8S_SCHEMAS,
  VALID_API_VERSIONS,
  DEPRECATED_API_VERSIONS,
  getSchemaForKind,
  type FieldDef,
  type ResourceSchema,
} from "./k8s-schemas";

export type Severity = "error" | "warning" | "info" | "hint";

export interface Diagnostic {
  line: number;
  column?: number;
  severity: Severity;
  message: string;
  fix?: string;
}

export interface CompileResult {
  valid: boolean;
  diagnostics: Diagnostic[];
  parsed: Record<string, unknown> | null;
  documents: Record<string, unknown>[];
}

interface ParsedDoc {
  doc: Record<string, unknown>;
  startLine: number;
}

function findLineOf(text: string, key: string, value?: unknown, startAfter = 0): number {
  const lines = text.split("\n");
  for (let i = startAfter; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (value !== undefined) {
      if (trimmed.startsWith(`${key}:`) && trimmed.includes(String(value))) return i + 1;
    } else {
      if (trimmed.startsWith(`${key}:`)) return i + 1;
    }
  }
  return startAfter + 1;
}

function findLineOfPath(text: string, path: string[], startLine = 0): number {
  const lines = text.split("\n");
  let currentIndent = -1;
  let searchIdx = 0;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trimStart();
    if (!stripped || stripped.startsWith("#")) continue;
    const indent = line.length - stripped.length;

    if (searchIdx < path.length) {
      if (stripped.startsWith(`${path[searchIdx]}:`) && indent > currentIndent) {
        currentIndent = indent;
        searchIdx++;
        if (searchIdx === path.length) return i + 1;
      }
    }
  }
  return startLine + 1;
}

export function compile(text: string): CompileResult {
  const diagnostics: Diagnostic[] = [];

  if (!text.trim()) {
    return { valid: true, diagnostics: [], parsed: null, documents: [] };
  }

  checkIndentation(text, diagnostics);
  checkCommonTypos(text, diagnostics);

  let documents: Record<string, unknown>[] = [];
  try {
    const docs = loadAll(text) as unknown[];
    documents = docs.filter((d): d is Record<string, unknown> => d !== null && typeof d === "object");
  } catch (e) {
    const err = e as YAMLException;
    diagnostics.push({
      line: err.mark?.line ? err.mark.line + 1 : 1,
      column: err.mark?.column,
      severity: "error",
      message: `YAML syntax error: ${err.reason || err.message}`,
      fix: getSyntaxFix(err.reason || err.message),
    });
    return { valid: false, diagnostics, parsed: null, documents: [] };
  }

  if (documents.length === 0) {
    diagnostics.push({ line: 1, severity: "warning", message: "Empty document" });
    return { valid: true, diagnostics, parsed: null, documents: [] };
  }

  const docBoundaries = findDocBoundaries(text);

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const startLine = docBoundaries[i] || 0;
    validateDocument(text, doc, startLine, diagnostics);
  }

  crossReferenceCheck(documents, text, diagnostics);

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return {
    valid: !hasErrors,
    diagnostics: diagnostics.sort((a, b) => a.line - b.line),
    parsed: documents[0] || null,
    documents,
  };
}

function findDocBoundaries(text: string): number[] {
  const lines = text.split("\n");
  const boundaries: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("---")) {
      boundaries.push(i + 1);
    }
  }
  return boundaries;
}

function checkIndentation(text: string, diagnostics: Diagnostic[]) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#") || line.startsWith("---")) continue;

    if (line.includes("\t")) {
      diagnostics.push({
        line: i + 1,
        severity: "error",
        message: "YAML does not allow tabs for indentation",
        fix: "Replace tabs with spaces (2 spaces per level is standard)",
      });
    }

    const leadingSpaces = line.length - line.trimStart().length;
    if (leadingSpaces % 2 !== 0 && leadingSpaces > 0) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("- ")) {
        diagnostics.push({
          line: i + 1,
          severity: "warning",
          message: `Odd indentation (${leadingSpaces} spaces). K8s YAML uses 2-space indentation`,
          fix: "Use 2 spaces per indentation level",
        });
      }
    }
  }
}

function checkCommonTypos(text: string, diagnostics: Diagnostic[]) {
  const lines = text.split("\n");
  const typos: Record<string, string> = {
    apiversion: "apiVersion",
    ApiVersion: "apiVersion",
    Apiversion: "apiVersion",
    api_version: "apiVersion",
    "api-version": "apiVersion",
    Kind: "kind",
    metatdata: "metadata",
    metdata: "metadata",
    matadata: "metadata",
    Metadata: "metadata",
    sepc: "spec",
    Spec: "spec",
    spce: "spec",
    conatiners: "containers",
    contianers: "containers",
    containres: "containers",
    conatainers: "containers",
    contaienrs: "containers",
    replcas: "replicas",
    replicsa: "replicas",
    Replicas: "replicas",
    namepsace: "namespace",
    namesapce: "namespace",
    namspace: "namespace",
    lables: "labels",
    labals: "labels",
    Lables: "labels",
    annotatinos: "annotations",
    annotaitons: "annotations",
    selecter: "selector",
    selctor: "selector",
    templete: "template",
    templat: "template",
    sevice: "service",
    serivce: "service",
    servcice: "service",
    conigMap: "configMap",
    confgiMap: "configMap",
    cofigMap: "configMap",
    screet: "secret",
    secert: "secret",
    secretNmae: "secretName",
    capcity: "capacity",
    capacty: "capacity",
    accesMode: "accessModes",
    accessMode: "accessModes",
    containerport: "containerPort",
    targetport: "targetPort",
    nodeport: "nodePort",
    clusterip: "clusterIP",
    ClusterIp: "clusterIP",
    nodePort_: "nodePort",
    restartpolicy: "restartPolicy",
    RestartPolicy: "restartPolicy",
    imagepullpolicy: "imagePullPolicy",
    ImagePullPolicy: "imagePullPolicy",
    mountpath: "mountPath",
    MountPath: "mountPath",
    volumemount: "volumeMounts",
    VolumeMount: "volumeMounts",
    storageclassname: "storageClassName",
    StorageClassName: "storageClassName",
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    const key = trimmed.split(":")[0].replace(/^-\s*/, "").trim();
    if (typos[key]) {
      diagnostics.push({
        line: i + 1,
        severity: "error",
        message: `Typo: "${key}" should be "${typos[key]}"`,
        fix: `Change "${key}" to "${typos[key]}"`,
      });
    }
  }
}

function validateDocument(text: string, doc: Record<string, unknown>, startLine: number, diagnostics: Diagnostic[]) {
  const apiVersion = doc.apiVersion as string | undefined;
  const kind = doc.kind as string | undefined;

  if (!apiVersion) {
    diagnostics.push({
      line: startLine + 1,
      severity: "error",
      message: "Missing required field: apiVersion",
      fix: "Add 'apiVersion: v1' or the appropriate API version",
    });
  }

  if (!kind) {
    diagnostics.push({
      line: startLine + 1,
      severity: "error",
      message: "Missing required field: kind",
      fix: "Add 'kind: Deployment' or the appropriate resource kind",
    });
  }

  if (!apiVersion || !kind) return;

  if (DEPRECATED_API_VERSIONS[apiVersion]) {
    diagnostics.push({
      line: findLineOf(text, "apiVersion", apiVersion, startLine),
      severity: "warning",
      message: `Deprecated apiVersion "${apiVersion}". ${DEPRECATED_API_VERSIONS[apiVersion]}`,
      fix: DEPRECATED_API_VERSIONS[apiVersion],
    });
  }

  const validVersions = VALID_API_VERSIONS[kind];
  if (validVersions && !validVersions.includes(apiVersion)) {
    diagnostics.push({
      line: findLineOf(text, "apiVersion", apiVersion, startLine),
      severity: "error",
      message: `Invalid apiVersion "${apiVersion}" for kind "${kind}"`,
      fix: `Use apiVersion: ${validVersions[0]}`,
    });
  }

  if (!K8S_SCHEMAS.some((s) => s.kind === kind)) {
    diagnostics.push({
      line: findLineOf(text, "kind", kind, startLine),
      severity: "info",
      message: `Unknown kind "${kind}". Schema validation skipped.`,
    });
    return;
  }

  const metadata = doc.metadata as Record<string, unknown> | undefined;
  if (!metadata) {
    diagnostics.push({
      line: startLine + 1,
      severity: "error",
      message: "Missing required field: metadata",
      fix: "Add metadata with at least a name field",
    });
  } else {
    if (!metadata.name) {
      diagnostics.push({
        line: findLineOfPath(text, ["metadata", "name"], startLine),
        severity: "error",
        message: "Missing required field: metadata.name",
        fix: "Add 'name: my-resource' under metadata",
      });
    } else {
      const name = String(metadata.name);
      if (!/^[a-z0-9]([a-z0-9\-.]{0,251}[a-z0-9])?$/.test(name)) {
        diagnostics.push({
          line: findLineOf(text, "name", name, startLine),
          severity: "error",
          message: `Invalid resource name "${name}". Must be lowercase alphanumeric with hyphens`,
          fix: "Use lowercase letters, numbers, and hyphens only. Must start/end with alphanumeric",
        });
      }
    }

    if (metadata.namespace && kind === "Namespace") {
      diagnostics.push({
        line: findLineOf(text, "namespace", undefined, startLine),
        severity: "warning",
        message: "Namespace resources should not have a namespace field in metadata",
        fix: "Remove the namespace field",
      });
    }

    const clusterScoped = ["Namespace", "PersistentVolume", "ClusterRole", "ClusterRoleBinding", "Node"];
    if (metadata.namespace && clusterScoped.includes(kind)) {
      diagnostics.push({
        line: findLineOf(text, "namespace", undefined, startLine),
        severity: "warning",
        message: `${kind} is cluster-scoped and should not have a namespace`,
        fix: "Remove the namespace field",
      });
    }
  }

  const schema = getSchemaForKind(kind);
  if (!schema) return;

  if (kind === "ConfigMap" || kind === "Secret" || kind === "Namespace" ||
      kind === "ResourceQuota" || kind === "LimitRange" || kind === "ServiceAccount") {
    validateFields(text, doc, schema.spec, startLine, diagnostics, kind);
  } else {
    const spec = doc.spec as Record<string, unknown> | undefined;
    if (!spec && schema.spec.length > 0) {
      diagnostics.push({
        line: startLine + 1,
        severity: "error",
        message: "Missing required field: spec",
        fix: "Add a spec section",
      });
    } else if (spec) {
      validateFields(text, spec, schema.spec, startLine, diagnostics, kind);
    }
  }

  validateResourceSpecific(text, doc, kind, startLine, diagnostics);
}

function validateFields(
  text: string,
  obj: Record<string, unknown>,
  fields: FieldDef[],
  startLine: number,
  diagnostics: Diagnostic[],
  kind: string
) {
  for (const field of fields) {
    if (field.required && obj[field.name] === undefined) {
      diagnostics.push({
        line: startLine + 1,
        severity: "error",
        message: `Missing required field: ${field.name} (${kind})`,
        fix: field.description || `Add the ${field.name} field`,
      });
    }

    if (obj[field.name] !== undefined && field.enum) {
      const val = obj[field.name];
      if (typeof val === "string" && !field.enum.includes(val)) {
        diagnostics.push({
          line: findLineOf(text, field.name, val, startLine),
          severity: "error",
          message: `Invalid value "${val}" for ${field.name}. Must be one of: ${field.enum.join(", ")}`,
          fix: `Use one of: ${field.enum.join(", ")}`,
        });
      }
    }

    if (obj[field.name] !== undefined && field.type === "number") {
      const val = obj[field.name];
      if (typeof val !== "number") {
        diagnostics.push({
          line: findLineOf(text, field.name, undefined, startLine),
          severity: "error",
          message: `${field.name} must be a number, got ${typeof val}`,
          fix: `Change to a numeric value`,
        });
      }
    }
  }
}

function validateResourceSpecific(
  text: string,
  doc: Record<string, unknown>,
  kind: string,
  startLine: number,
  diagnostics: Diagnostic[]
) {
  const spec = doc.spec as Record<string, unknown> | undefined;
  const metadata = doc.metadata as Record<string, unknown> | undefined;

  if (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") {
    if (spec) {
      const selector = spec.selector as Record<string, unknown> | undefined;
      const template = spec.template as Record<string, unknown> | undefined;
      const templateMeta = template?.metadata as Record<string, unknown> | undefined;
      const templateLabels = templateMeta?.labels as Record<string, string> | undefined;
      const matchLabels = selector?.matchLabels as Record<string, string> | undefined;

      if (matchLabels && templateLabels) {
        for (const [k, v] of Object.entries(matchLabels)) {
          if (templateLabels[k] !== v) {
            diagnostics.push({
              line: findLineOfPath(text, ["selector", "matchLabels"], startLine),
              severity: "error",
              message: `selector.matchLabels.${k}="${v}" does not match template.metadata.labels.${k}="${templateLabels[k] || "(missing)"}"`,
              fix: "Ensure selector.matchLabels matches template.metadata.labels exactly",
            });
          }
        }
      }

      if (template) {
        const podSpec = (template as Record<string, unknown>).spec as Record<string, unknown> | undefined;
        if (podSpec) {
          validatePodSpec(text, podSpec, startLine, diagnostics);
        }
      }

      if (kind === "Deployment") {
        const replicas = spec.replicas;
        if (replicas !== undefined && (typeof replicas !== "number" || replicas < 0)) {
          diagnostics.push({
            line: findLineOf(text, "replicas", undefined, startLine),
            severity: "error",
            message: "replicas must be a non-negative integer",
          });
        }
      }

      if (kind === "StatefulSet" && !spec.serviceName) {
        diagnostics.push({
          line: findLineOfPath(text, ["spec"], startLine),
          severity: "error",
          message: "StatefulSet requires serviceName (headless Service name)",
          fix: "Add serviceName: <headless-service-name>",
        });
      }
    }
  }

  if (kind === "Service" && spec) {
    const type = spec.type as string | undefined;
    const ports = spec.ports as Array<Record<string, unknown>> | undefined;

    if (ports) {
      for (const p of ports) {
        const port = p.port as number;
        if (port && (port < 1 || port > 65535)) {
          diagnostics.push({
            line: findLineOf(text, "port", port, startLine),
            severity: "error",
            message: `Port ${port} out of range (1-65535)`,
          });
        }
        if (p.nodePort) {
          const np = p.nodePort as number;
          if (type !== "NodePort" && type !== "LoadBalancer") {
            diagnostics.push({
              line: findLineOf(text, "nodePort", np, startLine),
              severity: "error",
              message: "nodePort is only valid for NodePort or LoadBalancer services",
              fix: `Change service type to NodePort or LoadBalancer, or remove nodePort`,
            });
          }
          if (np < 30000 || np > 32767) {
            diagnostics.push({
              line: findLineOf(text, "nodePort", np, startLine),
              severity: "error",
              message: `nodePort ${np} out of range (30000-32767)`,
            });
          }
        }
      }

      if (ports.length > 1) {
        const unnamed = ports.filter((p) => !p.name);
        if (unnamed.length > 0) {
          diagnostics.push({
            line: findLineOfPath(text, ["spec", "ports"], startLine),
            severity: "error",
            message: "All ports must have names when a Service has multiple ports",
            fix: "Add a unique 'name' field to each port entry",
          });
        }
      }
    }
  }

  if (kind === "CronJob" && spec) {
    const schedule = spec.schedule as string | undefined;
    if (schedule) {
      const parts = schedule.trim().split(/\s+/);
      if (parts.length !== 5) {
        diagnostics.push({
          line: findLineOf(text, "schedule", undefined, startLine),
          severity: "error",
          message: `Cron schedule must have exactly 5 fields (minute hour day month weekday), got ${parts.length}`,
          fix: "Example: '0 */6 * * *' (every 6 hours)",
        });
      }
    }
  }

  if (kind === "Ingress" && spec) {
    const rules = spec.rules as Array<Record<string, unknown>> | undefined;
    if (rules) {
      for (const rule of rules) {
        const http = rule.http as Record<string, unknown> | undefined;
        const paths = http?.paths as Array<Record<string, unknown>> | undefined;
        if (paths) {
          for (const p of paths) {
            const path = p.path as string | undefined;
            if (path && !path.startsWith("/")) {
              diagnostics.push({
                line: findLineOf(text, "path", path, startLine),
                severity: "error",
                message: `Ingress path "${path}" must start with /`,
                fix: `Change to "/${path}"`,
              });
            }
          }
        }
      }
    }
  }

  if (kind === "PersistentVolumeClaim" && spec) {
    const accessModes = spec.accessModes as string[] | undefined;
    if (accessModes) {
      const valid = ["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany", "ReadWriteOncePod"];
      for (const m of accessModes) {
        if (!valid.includes(m)) {
          diagnostics.push({
            line: findLineOf(text, "accessModes", undefined, startLine),
            severity: "error",
            message: `Invalid accessMode "${m}"`,
            fix: `Use one of: ${valid.join(", ")}`,
          });
        }
      }
    }
  }

  if ((kind === "Job" || kind === "CronJob") && spec) {
    let podSpec: Record<string, unknown> | undefined;
    if (kind === "Job") {
      const tmpl = spec.template as Record<string, unknown> | undefined;
      podSpec = tmpl?.spec as Record<string, unknown> | undefined;
    } else {
      const jobTmpl = spec.jobTemplate as Record<string, unknown> | undefined;
      const jobSpec = jobTmpl?.spec as Record<string, unknown> | undefined;
      const tmpl = jobSpec?.template as Record<string, unknown> | undefined;
      podSpec = tmpl?.spec as Record<string, unknown> | undefined;
    }
    if (podSpec && podSpec.restartPolicy === "Always") {
      diagnostics.push({
        line: findLineOf(text, "restartPolicy", "Always", startLine),
        severity: "error",
        message: `${kind} pods cannot use restartPolicy: Always`,
        fix: "Use restartPolicy: OnFailure or Never",
      });
    }
  }

  if (kind === "HorizontalPodAutoscaler" && spec) {
    const min = spec.minReplicas as number | undefined;
    const max = spec.maxReplicas as number | undefined;
    if (min !== undefined && max !== undefined && min > max) {
      diagnostics.push({
        line: findLineOf(text, "minReplicas", undefined, startLine),
        severity: "error",
        message: `minReplicas (${min}) cannot be greater than maxReplicas (${max})`,
      });
    }
  }

  if (kind === "PodDisruptionBudget" && spec) {
    if (spec.minAvailable !== undefined && spec.maxUnavailable !== undefined) {
      diagnostics.push({
        line: findLineOfPath(text, ["spec"], startLine),
        severity: "error",
        message: "PDB cannot specify both minAvailable and maxUnavailable",
        fix: "Remove one of minAvailable or maxUnavailable",
      });
    }
  }

  if (kind === "Secret") {
    const data = doc.data as Record<string, string> | undefined;
    const stringData = doc.stringData as Record<string, string> | undefined;
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") {
          try {
            atob(v);
          } catch {
            diagnostics.push({
              line: findLineOf(text, k, undefined, startLine),
              severity: "warning",
              message: `Secret data "${k}" does not look base64-encoded. Use stringData for plain text`,
              fix: `Move "${k}" to stringData (plain text, auto-encoded) or base64-encode the value`,
            });
          }
        }
      }
    }
  }

  if (metadata?.labels) {
    const labels = metadata.labels as Record<string, string>;
    for (const [k, v] of Object.entries(labels)) {
      if (typeof v !== "string") {
        diagnostics.push({
          line: findLineOf(text, k, undefined, startLine),
          severity: "error",
          message: `Label value for "${k}" must be a string. Got ${typeof v}`,
          fix: `Wrap the value in quotes: "${v}"`,
        });
      }
    }
  }
}

function validatePodSpec(text: string, podSpec: Record<string, unknown>, startLine: number, diagnostics: Diagnostic[]) {
  const containers = podSpec.containers as Array<Record<string, unknown>> | undefined;
  if (!containers || containers.length === 0) {
    diagnostics.push({
      line: findLineOfPath(text, ["containers"], startLine),
      severity: "error",
      message: "At least one container is required",
    });
    return;
  }

  const names = new Set<string>();
  for (const c of containers) {
    const name = c.name as string | undefined;
    if (name) {
      if (names.has(name)) {
        diagnostics.push({
          line: findLineOf(text, "name", name, startLine),
          severity: "error",
          message: `Duplicate container name "${name}"`,
        });
      }
      names.add(name);
    }

    const image = c.image as string | undefined;
    if (image) {
      if (image === "latest" || image.endsWith(":latest")) {
        diagnostics.push({
          line: findLineOf(text, "image", image, startLine),
          severity: "warning",
          message: "Using ':latest' tag is not recommended for production",
          fix: "Pin to a specific version tag (e.g. nginx:1.25.3)",
        });
      }
      if (!image.includes(":")) {
        diagnostics.push({
          line: findLineOf(text, "image", image, startLine),
          severity: "warning",
          message: `Image "${image}" has no tag, defaults to :latest`,
          fix: "Add an explicit version tag",
        });
      }
    }

    if (!c.resources) {
      diagnostics.push({
        line: findLineOf(text, "name", name, startLine),
        severity: "info",
        message: `Container "${name}" has no resource requests/limits`,
        fix: "Add resources.requests and resources.limits for CPU and memory",
      });
    }

    const volumeMounts = c.volumeMounts as Array<Record<string, unknown>> | undefined;
    const volumes = podSpec.volumes as Array<Record<string, unknown>> | undefined;
    if (volumeMounts) {
      for (const vm of volumeMounts) {
        const vmName = vm.name as string;
        if (vmName && volumes) {
          const found = volumes.some((v) => v.name === vmName);
          if (!found) {
            diagnostics.push({
              line: findLineOf(text, "name", vmName, startLine),
              severity: "error",
              message: `volumeMount "${vmName}" references undefined volume`,
              fix: `Add a volume named "${vmName}" in the volumes section`,
            });
          }
        }
      }
    }
  }
}

function crossReferenceCheck(
  documents: Record<string, unknown>[],
  text: string,
  diagnostics: Diagnostic[]
) {
  if (documents.length < 2) return;

  const resources = documents.map((doc) => ({
    kind: doc.kind as string,
    name: (doc.metadata as Record<string, unknown>)?.name as string,
    namespace: (doc.metadata as Record<string, unknown>)?.namespace as string | undefined,
    labels: ((doc.metadata as Record<string, unknown>)?.labels || {}) as Record<string, string>,
    spec: doc.spec as Record<string, unknown> | undefined,
  }));

  const services = resources.filter((r) => r.kind === "Service");
  const deployments = resources.filter((r) => ["Deployment", "StatefulSet", "DaemonSet"].includes(r.kind));

  for (const svc of services) {
    if (!svc.spec) continue;
    const svcSelector = svc.spec.selector as Record<string, string> | undefined;
    if (!svcSelector || Object.keys(svcSelector).length === 0) continue;

    const hasMatchingWorkload = deployments.some((dep) => {
      const template = dep.spec?.template as Record<string, unknown> | undefined;
      const tmplMeta = template?.metadata as Record<string, unknown> | undefined;
      const tmplLabels = (tmplMeta?.labels || {}) as Record<string, string>;
      return Object.entries(svcSelector).every(([k, v]) => tmplLabels[k] === v);
    });

    if (!hasMatchingWorkload) {
      diagnostics.push({
        line: findLineOf(text, "name", svc.name),
        severity: "warning",
        message: `Service "${svc.name}" selector does not match any workload template labels in this file`,
        fix: "Ensure a Deployment/StatefulSet has matching labels in spec.template.metadata.labels",
      });
    }
  }

  const ingresses = resources.filter((r) => r.kind === "Ingress");
  for (const ing of ingresses) {
    if (!ing.spec) continue;
    const rules = ing.spec.rules as Array<Record<string, unknown>> | undefined;
    if (!rules) continue;
    for (const rule of rules) {
      const http = rule.http as Record<string, unknown> | undefined;
      const paths = http?.paths as Array<Record<string, unknown>> | undefined;
      if (!paths) continue;
      for (const p of paths) {
        const backend = p.backend as Record<string, unknown> | undefined;
        const svcRef = backend?.service as Record<string, unknown> | undefined;
        if (svcRef?.name) {
          const svcName = svcRef.name as string;
          if (!services.some((s) => s.name === svcName)) {
            diagnostics.push({
              line: findLineOf(text, "name", svcName),
              severity: "warning",
              message: `Ingress backend references Service "${svcName}" which is not defined in this file`,
              fix: "Add a Service resource or verify the service name",
            });
          }
        }
      }
    }
  }

  for (const dep of deployments) {
    if (!dep.spec) continue;
    const template = dep.spec.template as Record<string, unknown> | undefined;
    const podSpec = (template?.spec || {}) as Record<string, unknown>;
    const volumes = podSpec.volumes as Array<Record<string, unknown>> | undefined;
    if (!volumes) continue;

    for (const vol of volumes) {
      if (vol.configMap) {
        const cmName = (vol.configMap as Record<string, unknown>).name as string;
        if (cmName && !resources.some((r) => r.kind === "ConfigMap" && r.name === cmName)) {
          diagnostics.push({
            line: findLineOf(text, "name", cmName),
            severity: "warning",
            message: `Volume references ConfigMap "${cmName}" which is not defined in this file`,
          });
        }
      }
      if (vol.secret) {
        const secName = (vol.secret as Record<string, unknown>).secretName as string;
        if (secName && !resources.some((r) => r.kind === "Secret" && r.name === secName)) {
          diagnostics.push({
            line: findLineOf(text, "secretName", secName),
            severity: "warning",
            message: `Volume references Secret "${secName}" which is not defined in this file`,
          });
        }
      }
      if (vol.persistentVolumeClaim) {
        const pvcName = (vol.persistentVolumeClaim as Record<string, unknown>).claimName as string;
        if (pvcName && !resources.some((r) => r.kind === "PersistentVolumeClaim" && r.name === pvcName)) {
          diagnostics.push({
            line: findLineOf(text, "claimName", pvcName),
            severity: "warning",
            message: `Volume references PVC "${pvcName}" which is not defined in this file`,
          });
        }
      }
    }
  }
}

function getSyntaxFix(reason: string): string {
  if (reason.includes("bad indentation")) return "Check indentation — YAML uses spaces, not tabs. Each level is 2 spaces";
  if (reason.includes("mapping values are not allowed")) return "Add a space after the colon, e.g. 'key: value'";
  if (reason.includes("duplicated mapping key")) return "Remove the duplicate key";
  if (reason.includes("unexpected end")) return "Check for missing closing brackets or incomplete values";
  if (reason.includes("can not read a block mapping")) return "Check that keys and values are properly aligned";
  return "Check YAML syntax — proper indentation, colons, and quoting";
}

export function getSmartDefaults(kind: string): Record<string, unknown> {
  const schema = getSchemaForKind(kind);
  if (!schema) return {};

  const defaults: Record<string, unknown> = {};
  for (const field of schema.spec) {
    if (field.default !== undefined) {
      defaults[field.name] = field.default;
    }
  }
  return defaults;
}

export function getSuggestionsForField(kind: string, fieldPath: string[]): string[] {
  const schema = getSchemaForKind(kind);
  if (!schema) return [];

  let fields = schema.spec;
  for (let i = 0; i < fieldPath.length - 1; i++) {
    const field = fields.find((f) => f.name === fieldPath[i]);
    if (!field?.children) return [];
    fields = field.children;
  }

  const current = fieldPath[fieldPath.length - 1];
  if (!current) return fields.map((f) => f.name);

  return fields
    .filter((f) => f.name.toLowerCase().startsWith(current.toLowerCase()))
    .map((f) => f.name);
}
