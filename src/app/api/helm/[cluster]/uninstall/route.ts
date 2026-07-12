import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { logAudit } from "@/lib/audit";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const { releaseName, namespace } = await request.json();

  if (!releaseName) {
    return NextResponse.json({ error: "releaseName is required" }, { status: 400 });
  }

  try {
    const cmd = `helm uninstall ${releaseName} --kube-context=${cluster} --namespace=${namespace || "default"}`;
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    logAudit("uninstall", releaseName, `namespace=${namespace || "default"}`, cluster);
    return NextResponse.json({ success: true, output: stdout.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to uninstall release";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
