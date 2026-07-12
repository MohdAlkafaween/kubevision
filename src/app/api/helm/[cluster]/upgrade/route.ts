import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const { releaseName, chart, namespace, values, version } = await request.json();

  if (!releaseName || !chart) {
    return NextResponse.json({ error: "releaseName and chart are required" }, { status: 400 });
  }

  try {
    const args = [
      "helm", "upgrade", releaseName, chart,
      `--kube-context=${cluster}`,
      `--namespace=${namespace || "default"}`,
      "--output=json",
    ];

    if (version) args.push(`--version=${version}`);

    if (values && Object.keys(values).length > 0) {
      for (const [key, val] of Object.entries(values)) {
        args.push(`--set=${key}=${val}`);
      }
    }

    const { stdout } = await execAsync(args.join(" "), {
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024,
    });

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = { output: stdout };
    }

    return NextResponse.json({ success: true, release: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upgrade release";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
