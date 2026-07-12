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
    const [quotaResult, limitResult] = await Promise.allSettled([
      execAsync(`kubectl get resourcequota -A -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }),
      execAsync(`kubectl get limitrange -A -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }),
    ]);

    const quotas = quotaResult.status === "fulfilled"
      ? (JSON.parse(quotaResult.value.stdout).items || []).map((item: Record<string, unknown>) => {
          const meta = (item.metadata || {}) as Record<string, unknown>;
          const spec = (item.spec || {}) as Record<string, unknown>;
          const status = (item.status || {}) as Record<string, unknown>;
          const hard = (spec.hard || status.hard || {}) as Record<string, string>;
          const used = ((status as Record<string, unknown>).used || {}) as Record<string, string>;
          return {
            type: "ResourceQuota" as const,
            name: meta.name,
            namespace: meta.namespace,
            resources: Object.keys(hard).map((key) => ({
              name: key,
              hard: hard[key],
              used: used[key] || "0",
            })),
          };
        })
      : [];

    const limitRanges = limitResult.status === "fulfilled"
      ? (JSON.parse(limitResult.value.stdout).items || []).map((item: Record<string, unknown>) => {
          const meta = (item.metadata || {}) as Record<string, unknown>;
          const spec = (item.spec || {}) as Record<string, unknown>;
          const limits = (spec.limits || []) as Array<Record<string, unknown>>;
          return {
            type: "LimitRange" as const,
            name: meta.name,
            namespace: meta.namespace,
            limits: limits.map((l) => ({
              limitType: l.type,
              default: l.default,
              defaultRequest: l.defaultRequest,
              max: l.max,
              min: l.min,
            })),
          };
        })
      : [];

    return NextResponse.json({ quotas, limitRanges });
  } catch {
    return NextResponse.json({ quotas: [], limitRanges: [] });
  }
}
