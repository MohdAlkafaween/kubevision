import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SnapshotResource {
  _kind: string;
  name: string;
  namespace?: string;
  uid: string;
  status: { phase: string; ready: boolean };
  labels: Record<string, string>;
  raw?: unknown;
}

interface DiffEntry {
  kind: string;
  name: string;
  namespace: string;
  change: "added" | "removed" | "modified";
  details?: string[];
}

export async function POST(request: Request) {
  const { baseId, compareId } = await request.json();

  const [base, compare] = await Promise.all([
    prisma.snapshot.findUnique({ where: { id: baseId } }),
    prisma.snapshot.findUnique({ where: { id: compareId } }),
  ]);

  if (!base || !compare) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const baseResources: SnapshotResource[] = JSON.parse(base.data);
  const compareResources: SnapshotResource[] = JSON.parse(compare.data);

  const key = (r: SnapshotResource) => `${r._kind}/${r.namespace || ""}/${r.name}`;
  const baseMap = new Map(baseResources.map((r) => [key(r), r]));
  const compareMap = new Map(compareResources.map((r) => [key(r), r]));

  const diffs: DiffEntry[] = [];

  for (const [k, cr] of compareMap) {
    const br = baseMap.get(k);
    if (!br) {
      diffs.push({ kind: cr._kind, name: cr.name, namespace: cr.namespace || "", change: "added" });
    } else {
      const details: string[] = [];
      if (br.status.phase !== cr.status.phase) {
        details.push(`Status: ${br.status.phase} → ${cr.status.phase}`);
      }
      if (br.status.ready !== cr.status.ready) {
        details.push(`Ready: ${br.status.ready} → ${cr.status.ready}`);
      }
      const brLabels = JSON.stringify(br.labels);
      const crLabels = JSON.stringify(cr.labels);
      if (brLabels !== crLabels) {
        details.push("Labels changed");
      }
      const brRaw = JSON.stringify(br.raw || {});
      const crRaw = JSON.stringify(cr.raw || {});
      if (brRaw !== crRaw) {
        const brSpec = ((br.raw as Record<string, unknown>)?.spec || {}) as Record<string, unknown>;
        const crSpec = ((cr.raw as Record<string, unknown>)?.spec || {}) as Record<string, unknown>;
        if (JSON.stringify(brSpec) !== JSON.stringify(crSpec)) {
          details.push("Spec changed");
        }
        const brStatus = ((br.raw as Record<string, unknown>)?.status || {}) as Record<string, unknown>;
        const crStatus = ((cr.raw as Record<string, unknown>)?.status || {}) as Record<string, unknown>;
        if (brStatus.replicas !== crStatus.replicas || brStatus.readyReplicas !== crStatus.readyReplicas) {
          details.push(`Replicas: ${brStatus.readyReplicas ?? "?"}/${brStatus.replicas ?? "?"} → ${crStatus.readyReplicas ?? "?"}/${crStatus.replicas ?? "?"}`);
        }
      }
      if (details.length > 0) {
        diffs.push({ kind: cr._kind, name: cr.name, namespace: cr.namespace || "", change: "modified", details });
      }
    }
  }

  for (const [k, br] of baseMap) {
    if (!compareMap.has(k)) {
      diffs.push({ kind: br._kind, name: br.name, namespace: br.namespace || "", change: "removed" });
    }
  }

  diffs.sort((a, b) => {
    const order = { removed: 0, added: 1, modified: 2 };
    return order[a.change] - order[b.change];
  });

  return NextResponse.json({
    base: { id: base.id, label: base.label, createdAt: base.createdAt, resourceCount: baseResources.length },
    compare: { id: compare.id, label: compare.label, createdAt: compare.createdAt, resourceCount: compareResources.length },
    diffs,
    summary: {
      added: diffs.filter((d) => d.change === "added").length,
      removed: diffs.filter((d) => d.change === "removed").length,
      modified: diffs.filter((d) => d.change === "modified").length,
    },
  });
}
