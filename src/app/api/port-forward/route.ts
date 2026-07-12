import { NextResponse } from "next/server";
import { exec, type ChildProcess } from "child_process";

export const dynamic = "force-dynamic";

interface PortForwardSession {
  id: string;
  kind: string;
  name: string;
  namespace: string;
  context: string;
  localPort: number;
  remotePort: number;
  process: ChildProcess;
  startedAt: string;
}

const sessions = new Map<string, PortForwardSession>();

export async function GET() {
  const active = [...sessions.values()].map(({ process: _p, ...rest }) => ({
    ...rest,
    pid: _p.pid,
  }));
  return NextResponse.json({ sessions: active });
}

export async function POST(request: Request) {
  try {
    const { kind, name, namespace, context, localPort, remotePort } =
      await request.json();

    if (!name || !context || !remotePort) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const ns = namespace || "default";
    const local = localPort || (30000 + Math.floor(Math.random() * 5000));
    const resource = kind?.toLowerCase() === "service" ? `svc/${name}` : `pod/${name}`;
    const id = `${context}-${ns}-${name}-${local}`;

    if (sessions.has(id)) {
      const existing = sessions.get(id)!;
      return NextResponse.json({
        id: existing.id,
        localPort: existing.localPort,
        remotePort: existing.remotePort,
        message: "Already forwarding",
      });
    }

    const cmd = `kubectl port-forward ${resource} ${local}:${remotePort} --namespace=${ns} --context=${context}`;

    const child = exec(cmd, { timeout: 0 });

    const session: PortForwardSession = {
      id,
      kind: kind || "Pod",
      name,
      namespace: ns,
      context,
      localPort: local,
      remotePort,
      process: child,
      startedAt: new Date().toISOString(),
    };

    sessions.set(id, session);

    child.on("exit", () => {
      sessions.delete(id);
    });

    child.on("error", () => {
      sessions.delete(id);
    });

    return NextResponse.json({
      id,
      localPort: local,
      remotePort,
      message: `Forwarding localhost:${local} → ${resource}:${remotePort}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Port-forward failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const session = sessions.get(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    session.process.kill();
    sessions.delete(id);

    return NextResponse.json({ message: "Port-forward stopped", id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
