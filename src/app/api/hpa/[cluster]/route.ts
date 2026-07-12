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
      `kubectl get hpa -A -o json --context=${cluster}`,
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout);
    const hpas = (data.items || []).map((item: Record<string, unknown>) => {
      const meta = (item.metadata || {}) as Record<string, unknown>;
      const spec = (item.spec || {}) as Record<string, unknown>;
      const status = (item.status || {}) as Record<string, unknown>;
      const scaleTarget = (spec.scaleTargetRef || {}) as Record<string, unknown>;
      const metrics = (spec.metrics || []) as Array<Record<string, unknown>>;
      const currentMetrics = (status.currentMetrics || []) as Array<Record<string, unknown>>;

      return {
        name: meta.name,
        namespace: meta.namespace,
        targetKind: scaleTarget.kind,
        targetName: scaleTarget.name,
        minReplicas: spec.minReplicas || 1,
        maxReplicas: spec.maxReplicas,
        currentReplicas: status.currentReplicas || 0,
        desiredReplicas: status.desiredReplicas || 0,
        metrics: metrics.map((m, i: number) => {
          const type = m.type as string;
          const current = currentMetrics[i] || {};
          if (type === "Resource") {
            const res = (m.resource || {}) as Record<string, unknown>;
            const target = (res.target || {}) as Record<string, unknown>;
            const curRes = (current.resource || {}) as Record<string, unknown>;
            const curCurrent = (curRes.current || {}) as Record<string, unknown>;
            return {
              type: "Resource",
              name: res.name,
              targetType: target.type,
              targetValue: target.averageUtilization || target.averageValue || target.value,
              currentValue: curCurrent.averageUtilization || curCurrent.averageValue || curCurrent.value,
            };
          }
          return { type, name: "custom" };
        }),
        conditions: ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
        })),
      };
    });

    return NextResponse.json({ hpas });
  } catch {
    return NextResponse.json({ hpas: [] });
  }
}
