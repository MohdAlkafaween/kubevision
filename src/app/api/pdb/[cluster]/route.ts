import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;

  try {
    const { stdout } = await execAsync(
      `kubectl get pdb -A -o json --context=${cluster}`,
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout);
    const pdbs = (data.items || []).map((item: Record<string, unknown>) => {
      const meta = (item.metadata || {}) as Record<string, unknown>;
      const spec = (item.spec || {}) as Record<string, unknown>;
      const status = (item.status || {}) as Record<string, unknown>;
      const selector = (spec.selector || {}) as Record<string, unknown>;
      const matchLabels = (selector.matchLabels || {}) as Record<string, string>;

      return {
        name: meta.name,
        namespace: meta.namespace,
        minAvailable: spec.minAvailable,
        maxUnavailable: spec.maxUnavailable,
        currentHealthy: status.currentHealthy || 0,
        desiredHealthy: status.desiredHealthy || 0,
        disruptionsAllowed: status.disruptionsAllowed || 0,
        expectedPods: status.expectedPods || 0,
        matchLabels,
      };
    });

    return NextResponse.json({ pdbs });
  } catch {
    return NextResponse.json({ pdbs: [] });
  }
}
