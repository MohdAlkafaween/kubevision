export interface FieldDef {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "map";
  required?: boolean;
  description?: string;
  enum?: string[];
  default?: unknown;
  children?: FieldDef[];
  itemType?: FieldDef;
  pattern?: RegExp;
}

export interface ResourceSchema {
  apiVersion: string;
  kind: string;
  description: string;
  category: string;
  spec: FieldDef[];
}

const metadataFields: FieldDef[] = [
  { name: "name", type: "string", required: true, description: "Resource name", pattern: /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$/ },
  { name: "namespace", type: "string", description: "Namespace (omit for cluster-scoped)" },
  { name: "labels", type: "map", description: "Key-value labels" },
  { name: "annotations", type: "map", description: "Key-value annotations" },
];

const containerFields: FieldDef[] = [
  { name: "name", type: "string", required: true, description: "Container name" },
  { name: "image", type: "string", required: true, description: "Container image (e.g. nginx:1.25)" },
  { name: "imagePullPolicy", type: "string", enum: ["Always", "IfNotPresent", "Never"], default: "IfNotPresent" },
  { name: "command", type: "array", itemType: { name: "item", type: "string" }, description: "Entrypoint command" },
  { name: "args", type: "array", itemType: { name: "item", type: "string" }, description: "Arguments to entrypoint" },
  {
    name: "ports", type: "array", description: "Container ports", itemType: {
      name: "port", type: "object", children: [
        { name: "containerPort", type: "number", required: true, description: "Port number (1-65535)" },
        { name: "name", type: "string", description: "Port name" },
        { name: "protocol", type: "string", enum: ["TCP", "UDP", "SCTP"], default: "TCP" },
      ]
    }
  },
  {
    name: "env", type: "array", description: "Environment variables", itemType: {
      name: "envVar", type: "object", children: [
        { name: "name", type: "string", required: true },
        { name: "value", type: "string" },
        { name: "valueFrom", type: "object", children: [
          { name: "configMapKeyRef", type: "object", children: [
            { name: "name", type: "string", required: true },
            { name: "key", type: "string", required: true },
          ]},
          { name: "secretKeyRef", type: "object", children: [
            { name: "name", type: "string", required: true },
            { name: "key", type: "string", required: true },
          ]},
          { name: "fieldRef", type: "object", children: [
            { name: "fieldPath", type: "string", required: true },
          ]},
        ]},
      ]
    }
  },
  {
    name: "resources", type: "object", description: "Resource limits/requests", children: [
      { name: "requests", type: "object", children: [
        { name: "cpu", type: "string", description: "e.g. 100m, 0.5" },
        { name: "memory", type: "string", description: "e.g. 128Mi, 1Gi" },
      ]},
      { name: "limits", type: "object", children: [
        { name: "cpu", type: "string" },
        { name: "memory", type: "string" },
      ]},
    ]
  },
  {
    name: "volumeMounts", type: "array", itemType: {
      name: "mount", type: "object", children: [
        { name: "name", type: "string", required: true },
        { name: "mountPath", type: "string", required: true },
        { name: "readOnly", type: "boolean" },
        { name: "subPath", type: "string" },
      ]
    }
  },
  {
    name: "livenessProbe", type: "object", description: "Liveness probe", children: [
      { name: "httpGet", type: "object", children: [
        { name: "path", type: "string", required: true },
        { name: "port", type: "number", required: true },
        { name: "scheme", type: "string", enum: ["HTTP", "HTTPS"] },
      ]},
      { name: "tcpSocket", type: "object", children: [
        { name: "port", type: "number", required: true },
      ]},
      { name: "exec", type: "object", children: [
        { name: "command", type: "array", itemType: { name: "cmd", type: "string" } },
      ]},
      { name: "initialDelaySeconds", type: "number" },
      { name: "periodSeconds", type: "number" },
      { name: "timeoutSeconds", type: "number" },
      { name: "failureThreshold", type: "number" },
    ]
  },
  {
    name: "readinessProbe", type: "object", description: "Readiness probe", children: [
      { name: "httpGet", type: "object", children: [
        { name: "path", type: "string", required: true },
        { name: "port", type: "number", required: true },
      ]},
      { name: "tcpSocket", type: "object", children: [{ name: "port", type: "number", required: true }] },
      { name: "initialDelaySeconds", type: "number" },
      { name: "periodSeconds", type: "number" },
    ]
  },
];

const volumeFields: FieldDef[] = [
  { name: "name", type: "string", required: true },
  { name: "configMap", type: "object", children: [{ name: "name", type: "string", required: true }] },
  { name: "secret", type: "object", children: [{ name: "secretName", type: "string", required: true }] },
  { name: "emptyDir", type: "object", children: [{ name: "medium", type: "string", enum: ["", "Memory"] }] },
  { name: "persistentVolumeClaim", type: "object", children: [
    { name: "claimName", type: "string", required: true },
    { name: "readOnly", type: "boolean" },
  ]},
  { name: "hostPath", type: "object", children: [
    { name: "path", type: "string", required: true },
    { name: "type", type: "string", enum: ["", "DirectoryOrCreate", "Directory", "FileOrCreate", "File"] },
  ]},
];

const podSpecFields: FieldDef[] = [
  { name: "containers", type: "array", required: true, itemType: { name: "container", type: "object", children: containerFields } },
  { name: "initContainers", type: "array", itemType: { name: "container", type: "object", children: containerFields } },
  { name: "volumes", type: "array", itemType: { name: "volume", type: "object", children: volumeFields } },
  { name: "restartPolicy", type: "string", enum: ["Always", "OnFailure", "Never"], default: "Always" },
  { name: "serviceAccountName", type: "string" },
  { name: "nodeSelector", type: "map" },
  { name: "tolerations", type: "array", itemType: {
    name: "toleration", type: "object", children: [
      { name: "key", type: "string" },
      { name: "operator", type: "string", enum: ["Exists", "Equal"] },
      { name: "value", type: "string" },
      { name: "effect", type: "string", enum: ["NoSchedule", "PreferNoSchedule", "NoExecute"] },
    ]
  }},
  { name: "affinity", type: "object" },
  { name: "imagePullSecrets", type: "array", itemType: { name: "ref", type: "object", children: [{ name: "name", type: "string", required: true }] } },
  { name: "terminationGracePeriodSeconds", type: "number" },
  { name: "dnsPolicy", type: "string", enum: ["ClusterFirst", "Default", "ClusterFirstWithHostNet", "None"] },
  { name: "hostNetwork", type: "boolean" },
  { name: "securityContext", type: "object", children: [
    { name: "runAsUser", type: "number" },
    { name: "runAsGroup", type: "number" },
    { name: "fsGroup", type: "number" },
    { name: "runAsNonRoot", type: "boolean" },
  ]},
];

const selectorFields: FieldDef[] = [
  { name: "matchLabels", type: "map", required: true, description: "Label selector" },
];

export const K8S_SCHEMAS: ResourceSchema[] = [
  {
    apiVersion: "v1", kind: "Namespace", description: "Logical isolation boundary", category: "core",
    spec: [],
  },
  {
    apiVersion: "apps/v1", kind: "Deployment", description: "Manages replicated pods with rolling updates", category: "workloads",
    spec: [
      { name: "replicas", type: "number", default: 1, description: "Desired number of pod replicas" },
      { name: "selector", type: "object", required: true, children: selectorFields },
      { name: "strategy", type: "object", children: [
        { name: "type", type: "string", enum: ["RollingUpdate", "Recreate"], default: "RollingUpdate" },
        { name: "rollingUpdate", type: "object", children: [
          { name: "maxUnavailable", type: "string", default: "25%" },
          { name: "maxSurge", type: "string", default: "25%" },
        ]},
      ]},
      { name: "template", type: "object", required: true, children: [
        { name: "metadata", type: "object", children: [{ name: "labels", type: "map", required: true }] },
        { name: "spec", type: "object", required: true, children: podSpecFields },
      ]},
      { name: "revisionHistoryLimit", type: "number", default: 10 },
    ],
  },
  {
    apiVersion: "apps/v1", kind: "StatefulSet", description: "Manages stateful pods with stable identities", category: "workloads",
    spec: [
      { name: "replicas", type: "number", default: 1 },
      { name: "serviceName", type: "string", required: true, description: "Headless service name" },
      { name: "selector", type: "object", required: true, children: selectorFields },
      { name: "template", type: "object", required: true, children: [
        { name: "metadata", type: "object", children: [{ name: "labels", type: "map", required: true }] },
        { name: "spec", type: "object", required: true, children: podSpecFields },
      ]},
      { name: "volumeClaimTemplates", type: "array", itemType: {
        name: "pvc", type: "object", children: [
          { name: "metadata", type: "object", children: [{ name: "name", type: "string", required: true }] },
          { name: "spec", type: "object", children: [
            { name: "accessModes", type: "array", itemType: { name: "mode", type: "string" } },
            { name: "resources", type: "object", children: [
              { name: "requests", type: "object", children: [{ name: "storage", type: "string", required: true }] },
            ]},
            { name: "storageClassName", type: "string" },
          ]},
        ]
      }},
      { name: "updateStrategy", type: "object", children: [
        { name: "type", type: "string", enum: ["RollingUpdate", "OnDelete"] },
      ]},
    ],
  },
  {
    apiVersion: "apps/v1", kind: "DaemonSet", description: "Ensures a pod runs on every node", category: "workloads",
    spec: [
      { name: "selector", type: "object", required: true, children: selectorFields },
      { name: "template", type: "object", required: true, children: [
        { name: "metadata", type: "object", children: [{ name: "labels", type: "map", required: true }] },
        { name: "spec", type: "object", required: true, children: podSpecFields },
      ]},
      { name: "updateStrategy", type: "object", children: [
        { name: "type", type: "string", enum: ["RollingUpdate", "OnDelete"] },
      ]},
    ],
  },
  {
    apiVersion: "v1", kind: "Service", description: "Exposes pods as a network service", category: "network",
    spec: [
      { name: "type", type: "string", enum: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"], default: "ClusterIP" },
      { name: "selector", type: "map", required: true, description: "Pod label selector" },
      { name: "ports", type: "array", required: true, itemType: {
        name: "port", type: "object", children: [
          { name: "name", type: "string", description: "Required if multiple ports" },
          { name: "port", type: "number", required: true, description: "Service port" },
          { name: "targetPort", type: "number", required: true, description: "Container port" },
          { name: "protocol", type: "string", enum: ["TCP", "UDP", "SCTP"], default: "TCP" },
          { name: "nodePort", type: "number", description: "Only for NodePort/LoadBalancer (30000-32767)" },
        ]
      }},
      { name: "clusterIP", type: "string", description: "Use 'None' for headless service" },
      { name: "externalTrafficPolicy", type: "string", enum: ["Cluster", "Local"] },
      { name: "sessionAffinity", type: "string", enum: ["None", "ClientIP"] },
    ],
  },
  {
    apiVersion: "networking.k8s.io/v1", kind: "Ingress", description: "HTTP(S) routing to services", category: "network",
    spec: [
      { name: "ingressClassName", type: "string", description: "e.g. nginx, traefik" },
      { name: "tls", type: "array", itemType: {
        name: "tls", type: "object", children: [
          { name: "hosts", type: "array", itemType: { name: "host", type: "string" } },
          { name: "secretName", type: "string", required: true },
        ]
      }},
      { name: "rules", type: "array", required: true, itemType: {
        name: "rule", type: "object", children: [
          { name: "host", type: "string", description: "Hostname (e.g. app.example.com)" },
          { name: "http", type: "object", required: true, children: [
            { name: "paths", type: "array", required: true, itemType: {
              name: "path", type: "object", children: [
                { name: "path", type: "string", required: true },
                { name: "pathType", type: "string", required: true, enum: ["Prefix", "Exact", "ImplementationSpecific"] },
                { name: "backend", type: "object", required: true, children: [
                  { name: "service", type: "object", required: true, children: [
                    { name: "name", type: "string", required: true },
                    { name: "port", type: "object", required: true, children: [
                      { name: "number", type: "number" },
                      { name: "name", type: "string" },
                    ]},
                  ]},
                ]},
              ]
            }},
          ]},
        ]
      }},
    ],
  },
  {
    apiVersion: "v1", kind: "ConfigMap", description: "Non-confidential key-value configuration", category: "config",
    spec: [
      { name: "data", type: "map", description: "UTF-8 key-value pairs" },
      { name: "binaryData", type: "map", description: "Base64-encoded binary data" },
    ],
  },
  {
    apiVersion: "v1", kind: "Secret", description: "Stores sensitive data (base64-encoded)", category: "config",
    spec: [
      { name: "type", type: "string", enum: ["Opaque", "kubernetes.io/tls", "kubernetes.io/dockerconfigjson", "kubernetes.io/basic-auth", "kubernetes.io/ssh-auth"], default: "Opaque" },
      { name: "data", type: "map", description: "Base64-encoded key-value pairs" },
      { name: "stringData", type: "map", description: "Plain-text data (auto-encoded on create)" },
    ],
  },
  {
    apiVersion: "v1", kind: "PersistentVolumeClaim", description: "Requests storage from a PV", category: "storage",
    spec: [
      { name: "accessModes", type: "array", required: true, itemType: { name: "mode", type: "string" }, description: "ReadWriteOnce, ReadOnlyMany, ReadWriteMany" },
      { name: "resources", type: "object", required: true, children: [
        { name: "requests", type: "object", required: true, children: [
          { name: "storage", type: "string", required: true, description: "e.g. 10Gi, 500Mi" },
        ]},
      ]},
      { name: "storageClassName", type: "string" },
      { name: "volumeMode", type: "string", enum: ["Filesystem", "Block"] },
      { name: "selector", type: "object", children: selectorFields },
    ],
  },
  {
    apiVersion: "v1", kind: "PersistentVolume", description: "Cluster-level storage resource", category: "storage",
    spec: [
      { name: "capacity", type: "object", required: true, children: [
        { name: "storage", type: "string", required: true },
      ]},
      { name: "accessModes", type: "array", required: true, itemType: { name: "mode", type: "string" } },
      { name: "persistentVolumeReclaimPolicy", type: "string", enum: ["Retain", "Recycle", "Delete"] },
      { name: "storageClassName", type: "string" },
      { name: "hostPath", type: "object", children: [{ name: "path", type: "string", required: true }] },
      { name: "nfs", type: "object", children: [
        { name: "server", type: "string", required: true },
        { name: "path", type: "string", required: true },
      ]},
    ],
  },
  {
    apiVersion: "batch/v1", kind: "Job", description: "Runs a pod to completion", category: "workloads",
    spec: [
      { name: "template", type: "object", required: true, children: [
        { name: "spec", type: "object", required: true, children: podSpecFields },
      ]},
      { name: "backoffLimit", type: "number", default: 6 },
      { name: "completions", type: "number", default: 1 },
      { name: "parallelism", type: "number", default: 1 },
      { name: "activeDeadlineSeconds", type: "number" },
      { name: "ttlSecondsAfterFinished", type: "number" },
    ],
  },
  {
    apiVersion: "batch/v1", kind: "CronJob", description: "Runs jobs on a schedule", category: "workloads",
    spec: [
      { name: "schedule", type: "string", required: true, description: "Cron expression (e.g. '*/5 * * * *')" },
      { name: "jobTemplate", type: "object", required: true, children: [
        { name: "spec", type: "object", required: true, children: [
          { name: "template", type: "object", required: true, children: [
            { name: "spec", type: "object", required: true, children: podSpecFields },
          ]},
          { name: "backoffLimit", type: "number" },
        ]},
      ]},
      { name: "concurrencyPolicy", type: "string", enum: ["Allow", "Forbid", "Replace"], default: "Allow" },
      { name: "successfulJobsHistoryLimit", type: "number", default: 3 },
      { name: "failedJobsHistoryLimit", type: "number", default: 1 },
      { name: "suspend", type: "boolean" },
    ],
  },
  {
    apiVersion: "v1", kind: "ServiceAccount", description: "Identity for pods", category: "rbac",
    spec: [
      { name: "automountServiceAccountToken", type: "boolean" },
      { name: "imagePullSecrets", type: "array", itemType: { name: "ref", type: "object", children: [{ name: "name", type: "string", required: true }] } },
    ],
  },
  {
    apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", description: "Namespace-scoped permissions", category: "rbac",
    spec: [
      { name: "rules", type: "array", required: true, itemType: {
        name: "rule", type: "object", children: [
          { name: "apiGroups", type: "array", required: true, itemType: { name: "g", type: "string" } },
          { name: "resources", type: "array", required: true, itemType: { name: "r", type: "string" } },
          { name: "verbs", type: "array", required: true, itemType: { name: "v", type: "string" } },
          { name: "resourceNames", type: "array", itemType: { name: "n", type: "string" } },
        ]
      }},
    ],
  },
  {
    apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", description: "Cluster-scoped permissions", category: "rbac",
    spec: [
      { name: "rules", type: "array", required: true, itemType: {
        name: "rule", type: "object", children: [
          { name: "apiGroups", type: "array", required: true, itemType: { name: "g", type: "string" } },
          { name: "resources", type: "array", required: true, itemType: { name: "r", type: "string" } },
          { name: "verbs", type: "array", required: true, itemType: { name: "v", type: "string" } },
        ]
      }},
    ],
  },
  {
    apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", description: "Binds a Role to subjects", category: "rbac",
    spec: [
      { name: "roleRef", type: "object", required: true, children: [
        { name: "apiGroup", type: "string", required: true },
        { name: "kind", type: "string", required: true, enum: ["Role", "ClusterRole"] },
        { name: "name", type: "string", required: true },
      ]},
      { name: "subjects", type: "array", required: true, itemType: {
        name: "subject", type: "object", children: [
          { name: "kind", type: "string", required: true, enum: ["User", "Group", "ServiceAccount"] },
          { name: "name", type: "string", required: true },
          { name: "namespace", type: "string" },
        ]
      }},
    ],
  },
  {
    apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding", description: "Binds a ClusterRole to subjects", category: "rbac",
    spec: [
      { name: "roleRef", type: "object", required: true, children: [
        { name: "apiGroup", type: "string", required: true },
        { name: "kind", type: "string", required: true, enum: ["ClusterRole"] },
        { name: "name", type: "string", required: true },
      ]},
      { name: "subjects", type: "array", required: true, itemType: {
        name: "subject", type: "object", children: [
          { name: "kind", type: "string", required: true, enum: ["User", "Group", "ServiceAccount"] },
          { name: "name", type: "string", required: true },
          { name: "namespace", type: "string" },
        ]
      }},
    ],
  },
  {
    apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", description: "Controls pod network traffic", category: "network",
    spec: [
      { name: "podSelector", type: "object", required: true, children: [{ name: "matchLabels", type: "map" }] },
      { name: "policyTypes", type: "array", itemType: { name: "type", type: "string" }, description: "Ingress, Egress" },
      { name: "ingress", type: "array", itemType: {
        name: "rule", type: "object", children: [
          { name: "from", type: "array", itemType: { name: "peer", type: "object", children: [
            { name: "podSelector", type: "object", children: [{ name: "matchLabels", type: "map" }] },
            { name: "namespaceSelector", type: "object", children: [{ name: "matchLabels", type: "map" }] },
            { name: "ipBlock", type: "object", children: [
              { name: "cidr", type: "string", required: true },
              { name: "except", type: "array", itemType: { name: "cidr", type: "string" } },
            ]},
          ]}},
          { name: "ports", type: "array", itemType: { name: "port", type: "object", children: [
            { name: "port", type: "number" },
            { name: "protocol", type: "string", enum: ["TCP", "UDP", "SCTP"] },
          ]}},
        ]
      }},
      { name: "egress", type: "array", itemType: {
        name: "rule", type: "object", children: [
          { name: "to", type: "array", itemType: { name: "peer", type: "object" } },
          { name: "ports", type: "array", itemType: { name: "port", type: "object", children: [
            { name: "port", type: "number" },
            { name: "protocol", type: "string" },
          ]}},
        ]
      }},
    ],
  },
  {
    apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", description: "Auto-scales pod replicas", category: "scaling",
    spec: [
      { name: "scaleTargetRef", type: "object", required: true, children: [
        { name: "apiVersion", type: "string", required: true },
        { name: "kind", type: "string", required: true, enum: ["Deployment", "StatefulSet", "ReplicaSet"] },
        { name: "name", type: "string", required: true },
      ]},
      { name: "minReplicas", type: "number", default: 1 },
      { name: "maxReplicas", type: "number", required: true },
      { name: "metrics", type: "array", itemType: {
        name: "metric", type: "object", children: [
          { name: "type", type: "string", required: true, enum: ["Resource", "Pods", "Object", "External"] },
          { name: "resource", type: "object", children: [
            { name: "name", type: "string", required: true, enum: ["cpu", "memory"] },
            { name: "target", type: "object", required: true, children: [
              { name: "type", type: "string", required: true, enum: ["Utilization", "AverageValue", "Value"] },
              { name: "averageUtilization", type: "number" },
              { name: "averageValue", type: "string" },
            ]},
          ]},
        ]
      }},
    ],
  },
  {
    apiVersion: "policy/v1", kind: "PodDisruptionBudget", description: "Limits voluntary pod disruptions", category: "scaling",
    spec: [
      { name: "minAvailable", type: "string", description: "Number or percentage (e.g. '2' or '50%')" },
      { name: "maxUnavailable", type: "string", description: "Number or percentage" },
      { name: "selector", type: "object", required: true, children: selectorFields },
    ],
  },
  {
    apiVersion: "v1", kind: "ResourceQuota", description: "Limits aggregate resource usage in a namespace", category: "config",
    spec: [
      { name: "hard", type: "map", required: true, description: "Resource limits (pods, cpu, memory, etc.)" },
    ],
  },
  {
    apiVersion: "v1", kind: "LimitRange", description: "Default resource limits for containers", category: "config",
    spec: [
      { name: "limits", type: "array", required: true, itemType: {
        name: "limit", type: "object", children: [
          { name: "type", type: "string", required: true, enum: ["Container", "Pod", "PersistentVolumeClaim"] },
          { name: "default", type: "object", children: [
            { name: "cpu", type: "string" },
            { name: "memory", type: "string" },
          ]},
          { name: "defaultRequest", type: "object", children: [
            { name: "cpu", type: "string" },
            { name: "memory", type: "string" },
          ]},
          { name: "max", type: "object", children: [{ name: "cpu", type: "string" }, { name: "memory", type: "string" }] },
          { name: "min", type: "object", children: [{ name: "cpu", type: "string" }, { name: "memory", type: "string" }] },
        ]
      }},
    ],
  },
];

export function getSchemaForKind(kind: string): ResourceSchema | undefined {
  return K8S_SCHEMAS.find((s) => s.kind === kind);
}

export function getSchemaByApiVersionKind(apiVersion: string, kind: string): ResourceSchema | undefined {
  return K8S_SCHEMAS.find((s) => s.apiVersion === apiVersion && s.kind === kind);
}

export const VALID_API_VERSIONS: Record<string, string[]> = {
  Namespace: ["v1"],
  Deployment: ["apps/v1"],
  StatefulSet: ["apps/v1"],
  DaemonSet: ["apps/v1"],
  ReplicaSet: ["apps/v1"],
  Service: ["v1"],
  Ingress: ["networking.k8s.io/v1"],
  ConfigMap: ["v1"],
  Secret: ["v1"],
  PersistentVolumeClaim: ["v1"],
  PersistentVolume: ["v1"],
  Job: ["batch/v1"],
  CronJob: ["batch/v1"],
  ServiceAccount: ["v1"],
  Role: ["rbac.authorization.k8s.io/v1"],
  ClusterRole: ["rbac.authorization.k8s.io/v1"],
  RoleBinding: ["rbac.authorization.k8s.io/v1"],
  ClusterRoleBinding: ["rbac.authorization.k8s.io/v1"],
  NetworkPolicy: ["networking.k8s.io/v1"],
  HorizontalPodAutoscaler: ["autoscaling/v2", "autoscaling/v1"],
  PodDisruptionBudget: ["policy/v1"],
  ResourceQuota: ["v1"],
  LimitRange: ["v1"],
};

export const DEPRECATED_API_VERSIONS: Record<string, string> = {
  "extensions/v1beta1": "Use networking.k8s.io/v1 for Ingress, apps/v1 for Deployments",
  "apps/v1beta1": "Use apps/v1",
  "apps/v1beta2": "Use apps/v1",
  "batch/v1beta1": "Use batch/v1 for CronJob",
  "networking.k8s.io/v1beta1": "Use networking.k8s.io/v1",
  "policy/v1beta1": "Use policy/v1 for PodDisruptionBudget",
  "autoscaling/v2beta1": "Use autoscaling/v2",
  "autoscaling/v2beta2": "Use autoscaling/v2",
};
