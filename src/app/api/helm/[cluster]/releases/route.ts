import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { gunzipSync } from "zlib";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export interface HelmRelease {
  name: string;
  namespace: string;
  chart: string;
  version: string;
  appVersion: string;
  status: string;
  revision: number;
  updated: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;

  try {
    const { stdout } = await execAsync(
      `kubectl get secrets -A -l owner=helm -o json --context=${cluster}`,
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );

    const secretList = JSON.parse(stdout);
    const releases: HelmRelease[] = [];
    const seen = new Set<string>();

    for (const secret of secretList.items || []) {
      try {
        const releaseData = secret.data?.release;
        if (!releaseData) continue;

        const decoded = Buffer.from(releaseData, "base64");
        let json: string;
        try {
          json = gunzipSync(decoded).toString("utf-8");
        } catch {
          json = decoded.toString("utf-8");
        }

        const release = JSON.parse(json);
        const key = `${release.namespace}/${release.name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        releases.push({
          name: release.name || secret.metadata?.labels?.name || "unknown",
          namespace: release.namespace || secret.metadata?.namespace || "default",
          chart: release.chart?.metadata?.name || "unknown",
          version: release.chart?.metadata?.version || "0.0.0",
          appVersion: release.chart?.metadata?.appVersion || "",
          status: release.info?.status || "unknown",
          revision: release.version || 1,
          updated: release.info?.last_deployed || "",
        });
      } catch {
        // skip malformed release secrets
      }
    }

    return NextResponse.json({ releases });
  } catch {
    try {
      const { stdout } = await execAsync(
        `helm list -A --output json --kube-context=${cluster}`,
        { timeout: 15000 }
      );
      const helmList = JSON.parse(stdout || "[]");
      const releases: HelmRelease[] = helmList.map(
        (r: Record<string, string>) => ({
          name: r.name,
          namespace: r.namespace,
          chart: r.chart?.split("-").slice(0, -1).join("-") || r.chart,
          version: r.chart?.split("-").pop() || "",
          appVersion: r.app_version || "",
          status: r.status,
          revision: parseInt(r.revision) || 1,
          updated: r.updated || "",
        })
      );
      return NextResponse.json({ releases });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list Helm releases";
      return NextResponse.json({ releases: [], error: message });
    }
  }
}
