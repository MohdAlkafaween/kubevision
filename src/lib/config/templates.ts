export interface ConfigTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  kinds: string[];
  yaml: string;
}

export const CONFIG_TEMPLATES: ConfigTemplate[] = [
  {
    id: "deployment-basic",
    name: "Basic Deployment",
    category: "Workloads",
    description: "Simple deployment with replicas, health checks, and resource limits",
    kinds: ["Deployment"],
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: nginx:1.25
          ports:
            - containerPort: 80
              name: http
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 5`,
  },
  {
    id: "deployment-service",
    name: "Deployment + Service",
    category: "Workloads",
    description: "Deployment with a matching ClusterIP Service",
    kinds: ["Deployment", "Service"],
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
  labels:
    app: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: nginx:1.25
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 80`,
  },
  {
    id: "full-stack",
    name: "Full Stack (Deploy + Svc + Ingress + ConfigMap)",
    category: "Workloads",
    description: "Complete app stack with Deployment, Service, Ingress, and ConfigMap",
    kinds: ["ConfigMap", "Deployment", "Service", "Ingress"],
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
  namespace: default
data:
  APP_ENV: production
  LOG_LEVEL: info
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: my-app:1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: APP_ENV
              valueFrom:
                configMapKeyRef:
                  name: my-app-config
                  key: APP_ENV
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: my-app-config
                  key: LOG_LEVEL
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: my-app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80`,
  },
  {
    id: "statefulset",
    name: "StatefulSet with PVC",
    category: "Workloads",
    description: "StatefulSet with headless service and persistent volume claims",
    kinds: ["Service", "StatefulSet"],
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: my-db-headless
  namespace: default
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: my-db
  ports:
    - name: tcp
      port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-db
  namespace: default
spec:
  serviceName: my-db-headless
  replicas: 3
  selector:
    matchLabels:
      app: my-db
  template:
    metadata:
      labels:
        app: my-db
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: mydb
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: my-db-secret
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-db-secret
                  key: password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 10Gi`,
  },
  {
    id: "daemonset",
    name: "DaemonSet",
    category: "Workloads",
    description: "Runs a pod on every node (log collector, monitoring agent)",
    kinds: ["DaemonSet"],
    yaml: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-collector
  namespace: kube-system
  labels:
    app: log-collector
spec:
  selector:
    matchLabels:
      app: log-collector
  template:
    metadata:
      labels:
        app: log-collector
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: collector
          image: fluent/fluent-bit:3.0
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
            type: Directory`,
  },
  {
    id: "cronjob",
    name: "CronJob",
    category: "Workloads",
    description: "Scheduled job running on a cron schedule",
    kinds: ["CronJob"],
    yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup-job
  namespace: default
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 3
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cleanup
              image: busybox:1.36
              command:
                - /bin/sh
                - -c
                - echo "Running cleanup at $(date)"
              resources:
                requests:
                  cpu: 50m
                  memory: 64Mi
                limits:
                  cpu: 200m
                  memory: 128Mi`,
  },
  {
    id: "job",
    name: "Job",
    category: "Workloads",
    description: "One-time batch job",
    kinds: ["Job"],
    yaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: default
spec:
  backoffLimit: 3
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: my-app:1.0.0
          command: ["./migrate", "--up"]
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi`,
  },
  {
    id: "service-nodeport",
    name: "NodePort Service",
    category: "Network",
    description: "Exposes a service on a static port on every node",
    kinds: ["Service"],
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: my-app-nodeport
  namespace: default
spec:
  type: NodePort
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
      nodePort: 30080`,
  },
  {
    id: "service-loadbalancer",
    name: "LoadBalancer Service",
    category: "Network",
    description: "Cloud load balancer service",
    kinds: ["Service"],
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
  namespace: default
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
    - name: https
      port: 443
      targetPort: 8443`,
  },
  {
    id: "ingress-tls",
    name: "Ingress with TLS",
    category: "Network",
    description: "HTTPS Ingress with TLS termination",
    kinds: ["Ingress"],
    yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  namespace: default
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls-cert
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: my-api
                port:
                  number: 8080`,
  },
  {
    id: "network-policy",
    name: "Network Policy",
    category: "Network",
    description: "Restrict pod network access (ingress + egress)",
    kinds: ["NetworkPolicy"],
    yaml: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: my-app-netpol
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: my-app
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
      ports:
        - port: 8080
          protocol: TCP
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: my-db
      ports:
        - port: 5432
          protocol: TCP
    - to:
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP`,
  },
  {
    id: "configmap",
    name: "ConfigMap",
    category: "Config",
    description: "Key-value configuration data",
    kinds: ["ConfigMap"],
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: default
data:
  DATABASE_HOST: postgres.default.svc.cluster.local
  DATABASE_PORT: "5432"
  LOG_LEVEL: info
  config.yaml: |
    server:
      port: 8080
      readTimeout: 30s
    database:
      maxConnections: 20`,
  },
  {
    id: "secret",
    name: "Secret",
    category: "Config",
    description: "Sensitive data (credentials, tokens)",
    kinds: ["Secret"],
    yaml: `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
type: Opaque
stringData:
  username: admin
  password: changeme
  api-key: your-api-key-here`,
  },
  {
    id: "pvc",
    name: "PersistentVolumeClaim",
    category: "Storage",
    description: "Request storage from the cluster",
    kinds: ["PersistentVolumeClaim"],
    yaml: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard`,
  },
  {
    id: "namespace",
    name: "Namespace",
    category: "Core",
    description: "Logical cluster partition",
    kinds: ["Namespace"],
    yaml: `apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
  labels:
    team: platform
    environment: production`,
  },
  {
    id: "rbac-full",
    name: "RBAC (ServiceAccount + Role + Binding)",
    category: "RBAC",
    description: "Complete RBAC setup with ServiceAccount, Role, and RoleBinding",
    kinds: ["ServiceAccount", "Role", "RoleBinding"],
    yaml: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app-sa
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: my-app-role
  namespace: default
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-app-binding
  namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: my-app-role
subjects:
  - kind: ServiceAccount
    name: my-app-sa
    namespace: default`,
  },
  {
    id: "hpa",
    name: "Horizontal Pod Autoscaler",
    category: "Scaling",
    description: "Auto-scale deployment based on CPU/memory",
    kinds: ["HorizontalPodAutoscaler"],
    yaml: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80`,
  },
  {
    id: "pdb",
    name: "Pod Disruption Budget",
    category: "Scaling",
    description: "Protect availability during disruptions",
    kinds: ["PodDisruptionBudget"],
    yaml: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
  namespace: default
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: my-app`,
  },
  {
    id: "resource-quota",
    name: "Resource Quota",
    category: "Config",
    description: "Limit resource consumption in a namespace",
    kinds: ["ResourceQuota"],
    yaml: `apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: default
spec:
  hard:
    pods: "50"
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi`,
  },
  {
    id: "limit-range",
    name: "Limit Range",
    category: "Config",
    description: "Default resource limits for containers in a namespace",
    kinds: ["LimitRange"],
    yaml: `apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: default
spec:
  limits:
    - type: Container
      default:
        cpu: 500m
        memory: 256Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      max:
        cpu: "2"
        memory: 2Gi
      min:
        cpu: 50m
        memory: 64Mi`,
  },
];

export function getTemplatesByCategory(): Record<string, ConfigTemplate[]> {
  const grouped: Record<string, ConfigTemplate[]> = {};
  for (const t of CONFIG_TEMPLATES) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }
  return grouped;
}
