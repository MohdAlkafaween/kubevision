import type { K8sResource, CommandSuggestion } from "@/types/k8s";

export function getCommandSuggestions(resource: K8sResource): CommandSuggestion[] {
  const ns = resource.namespace ? `-n ${resource.namespace}` : "";
  const suggestions: CommandSuggestion[] = [];

  switch (resource.kind) {
    case "Pod": {
      suggestions.push({
        label: "Describe Pod",
        command: `kubectl describe pod ${resource.name} ${ns}`.trim(),
        description: "Show detailed information about the pod",
        severity: "info",
      });
      suggestions.push({
        label: "View Logs",
        command: `kubectl logs ${resource.name} ${ns} --tail=100`.trim(),
        description: "Show recent logs from the pod",
        severity: "info",
      });

      if (resource.status.phase === "Running") {
        suggestions.push({
          label: "Exec Shell",
          command: `kubectl exec -it ${resource.name} ${ns} -- /bin/sh`.trim(),
          description: "Open a shell in the container",
          severity: "info",
        });
      }

      if (resource.status.containerStatuses?.some((c) => c.state === "waiting")) {
        suggestions.push({
          label: "Previous Logs",
          command: `kubectl logs ${resource.name} ${ns} --previous`.trim(),
          description: "Show logs from the previous container instance",
          severity: "warning",
        });
      }

      if ((resource.status.restartCount || 0) > 3) {
        suggestions.push({
          label: "Check Events",
          command: `kubectl get events ${ns} --field-selector involvedObject.name=${resource.name}`.trim(),
          description: "Show events related to this pod",
          severity: "warning",
        });
        suggestions.push({
          label: "Delete Pod",
          command: `kubectl delete pod ${resource.name} ${ns}`.trim(),
          description: "Delete and let the controller recreate the pod",
          severity: "danger",
        });
      }

      suggestions.push({
        label: "Get YAML",
        command: `kubectl get pod ${resource.name} ${ns} -o yaml`.trim(),
        description: "Show the full YAML spec",
        severity: "info",
      });
      suggestions.push({
        label: "Resource Usage",
        command: `kubectl top pod ${resource.name} ${ns}`.trim(),
        description: "Show CPU and memory usage",
        severity: "info",
      });
      break;
    }

    case "Node": {
      suggestions.push({
        label: "Describe Node",
        command: `kubectl describe node ${resource.name}`,
        description: "Show detailed node information",
        severity: "info",
      });
      suggestions.push({
        label: "Node Resources",
        command: `kubectl top node ${resource.name}`,
        description: "Show CPU and memory usage",
        severity: "info",
      });
      suggestions.push({
        label: "Pods on Node",
        command: `kubectl get pods --all-namespaces --field-selector spec.nodeName=${resource.name}`,
        description: "List all pods scheduled on this node",
        severity: "info",
      });

      if (!resource.status.ready) {
        suggestions.push({
          label: "Cordon Node",
          command: `kubectl cordon ${resource.name}`,
          description: "Mark node as unschedulable",
          severity: "warning",
        });
        suggestions.push({
          label: "Drain Node",
          command: `kubectl drain ${resource.name} --ignore-daemonsets --delete-emptydir-data`,
          description: "Safely evict all pods from the node",
          severity: "danger",
        });
      }
      break;
    }

    case "Deployment": {
      suggestions.push({
        label: "Rollout Status",
        command: `kubectl rollout status deployment/${resource.name} ${ns}`.trim(),
        description: "Check the rollout status",
        severity: "info",
      });
      suggestions.push({
        label: "Rollout History",
        command: `kubectl rollout history deployment/${resource.name} ${ns}`.trim(),
        description: "View rollout history",
        severity: "info",
      });
      suggestions.push({
        label: "Scale",
        command: `kubectl scale deployment/${resource.name} ${ns} --replicas=3`.trim(),
        description: "Scale the deployment (edit replica count)",
        severity: "warning",
      });
      suggestions.push({
        label: "Restart",
        command: `kubectl rollout restart deployment/${resource.name} ${ns}`.trim(),
        description: "Rolling restart of all pods",
        severity: "warning",
      });
      suggestions.push({
        label: "Rollback",
        command: `kubectl rollout undo deployment/${resource.name} ${ns}`.trim(),
        description: "Rollback to previous revision",
        severity: "danger",
      });
      break;
    }

    case "Service": {
      suggestions.push({
        label: "Describe Service",
        command: `kubectl describe service ${resource.name} ${ns}`.trim(),
        description: "Show service details and endpoints",
        severity: "info",
      });
      suggestions.push({
        label: "Get Endpoints",
        command: `kubectl get endpoints ${resource.name} ${ns}`.trim(),
        description: "Show endpoint addresses",
        severity: "info",
      });
      suggestions.push({
        label: "Port Forward",
        command: `kubectl port-forward service/${resource.name} ${ns} 8080:80`.trim(),
        description: "Forward local port to the service",
        severity: "info",
      });
      break;
    }

    case "Namespace": {
      suggestions.push({
        label: "Get All Resources",
        command: `kubectl get all -n ${resource.name}`,
        description: "List all resources in this namespace",
        severity: "info",
      });
      suggestions.push({
        label: "Get Events",
        command: `kubectl get events -n ${resource.name} --sort-by=.lastTimestamp`,
        description: "Show recent events in the namespace",
        severity: "info",
      });
      suggestions.push({
        label: "Resource Quotas",
        command: `kubectl get resourcequota -n ${resource.name}`,
        description: "Show resource quotas",
        severity: "info",
      });
      break;
    }

    default: {
      const kindStr = resource.kind || "resource";
      suggestions.push({
        label: `Describe ${kindStr}`,
        command: `kubectl describe ${kindStr.toLowerCase()} ${resource.name} ${ns}`.trim(),
        description: `Show detailed ${kindStr} information`,
        severity: "info",
      });
      suggestions.push({
        label: "Get YAML",
        command: `kubectl get ${kindStr.toLowerCase()} ${resource.name} ${ns} -o yaml`.trim(),
        description: "Show the full YAML spec",
        severity: "info",
      });
    }
  }

  return suggestions;
}
