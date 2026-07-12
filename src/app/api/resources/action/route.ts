import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

type Action = "restart" | "stop" | "start" | "delete";

const RESTARTABLE_KINDS = ["Deployment", "StatefulSet", "DaemonSet"];
const STARTABLE_KINDS = ["Deployment", "StatefulSet"];
const STOPPABLE_KINDS = ["Deployment", "StatefulSet"];
const DELETABLE_KINDS = [
  "Pod", "Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob",
  "Service", "Ingress", "ConfigMap", "Secret",
];

function validateAction(action: Action, kind: string): string | null {
  if (action === "restart" && !RESTARTABLE_KINDS.includes(kind)) {
    return `Cannot restart ${kind}. Only Deployments, StatefulSets, and DaemonSets support rollout restart.`;
  }
  if (action === "start" && !STARTABLE_KINDS.includes(kind)) {
    return `Cannot start ${kind}. Only Deployments and StatefulSets can be scaled.`;
  }
  if (action === "stop" && !STOPPABLE_KINDS.includes(kind)) {
    return `Cannot stop ${kind}. Only Deployments and StatefulSets can be scaled to 0.`;
  }
  if (action === "delete" && !DELETABLE_KINDS.includes(kind)) {
    return `Cannot delete ${kind} through this interface.`;
  }
  return null;
}

function buildCommand(action: Action, kind: string, name: string, namespace: string, context: string, replicas?: number): string {
  const nsFlag = `--namespace=${namespace}`;
  const ctxFlag = `--context=${context}`;
  const resource = kind.toLowerCase();

  switch (action) {
    case "restart":
      return `kubectl rollout restart ${resource}/${name} ${nsFlag} ${ctxFlag}`;
    case "start":
      return `kubectl scale ${resource}/${name} --replicas=${replicas || 1} ${nsFlag} ${ctxFlag}`;
    case "stop":
      return `kubectl scale ${resource}/${name} --replicas=0 ${nsFlag} ${ctxFlag}`;
    case "delete":
      return `kubectl delete ${resource}/${name} ${nsFlag} ${ctxFlag}`;
  }
}

export async function POST(request: Request) {
  try {
    const { action, kind, name, namespace, context, replicas } = await request.json();

    if (!action || !kind || !name || !context) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const ns = namespace || "default";
    const validationError = validateAction(action as Action, kind);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const command = buildCommand(action as Action, kind, name, ns, context, replicas);

    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    return NextResponse.json({
      success: true,
      message: `${action} ${kind}/${name} completed`,
      stdout: stdout || "",
      stderr: stderr || "",
    });
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      success: false,
      error: execError.stderr || execError.message || "Action failed",
      stdout: execError.stdout || "",
    }, { status: 500 });
  }
}
