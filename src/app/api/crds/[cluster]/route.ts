import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export interface CrdSummary {
  name: string;
  group: string;
  kind: string;
  plural: string;
  scope: string;
  versions: string[];
  age: string;
}

export interface CrdInstanceSummary {
  name: string;
  namespace?: string;
  uid: string;
  creationTimestamp: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);
  const { searchParams } = new URL(request.url);
  const crdName = searchParams.get("crd");

  try {
    if (crdName) {
      // List instances of a specific CRD
      const { stdout } = await execAsync(
        `kubectl get ${crdName} -A -o json --context=${contextName}`,
        { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
      );
      const list = JSON.parse(stdout);
      const instances: CrdInstanceSummary[] = (list.items || []).map(
        (item: Record<string, unknown>) => {
          const meta = (item.metadata || {}) as Record<string, unknown>;
          return {
            name: (meta.name as string) || "unknown",
            namespace: meta.namespace as string | undefined,
            uid: (meta.uid as string) || `${meta.name}`,
            creationTimestamp: (meta.creationTimestamp as string) || "",
          };
        }
      );
      return NextResponse.json({ instances, items: list.items || [] });
    }

    // List all CRDs
    const { stdout } = await execAsync(
      `kubectl get crds -o json --context=${contextName}`,
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );
    const list = JSON.parse(stdout);
    const crds: CrdSummary[] = (list.items || []).map((item: Record<string, unknown>) => {
      const meta = (item.metadata || {}) as Record<string, unknown>;
      const spec = (item.spec || {}) as Record<string, unknown>;
      const names = (spec.names || {}) as Record<string, unknown>;
      const versionsList = (spec.versions || []) as Array<{ name: string }>;
      return {
        name: (meta.name as string) || "unknown",
        group: (spec.group as string) || "",
        kind: (names.kind as string) || "",
        plural: (names.plural as string) || "",
        scope: (spec.scope as string) || "Namespaced",
        versions: versionsList.map((v) => v.name),
        age: (meta.creationTimestamp as string) || "",
      };
    });
    crds.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ crds });
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    const message = execError.stderr || execError.message || "Failed to query CRDs";
    return NextResponse.json({ crds: [], instances: [], error: message }, { status: 500 });
  }
}
