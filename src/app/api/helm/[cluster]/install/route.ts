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
  const { chart, releaseName, namespace, values, version, repo } = await request.json();

  if (!chart || !releaseName) {
    return NextResponse.json({ error: "chart and releaseName are required" }, { status: 400 });
  }

  try {
    const args = [
      "helm", "install", releaseName, chart,
      `--kube-context=${cluster}`,
      `--namespace=${namespace || "default"}`,
      "--create-namespace",
      "--output=json",
    ];

    if (version) args.push(`--version=${version}`);

    if (repo) {
      await execAsync(`helm repo add temp-${Date.now()} ${repo} 2>/dev/null || true`, { timeout: 30000 });
      await execAsync(`helm repo update`, { timeout: 30000 });
    }

    if (values && Object.keys(values).length > 0) {
      for (const [key, val] of Object.entries(values)) {
        args.push(`--set=${key}=${val}`);
      }
    }

    const { stdout, stderr } = await execAsync(args.join(" "), {
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024,
    });

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = { info: { status: "deployed" }, output: stdout };
    }

    logAudit("install", releaseName, `chart=${chart}${version ? ` version=${version}` : ""}`, cluster);

    return NextResponse.json({ success: true, release: result, warnings: stderr || undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to install chart";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
