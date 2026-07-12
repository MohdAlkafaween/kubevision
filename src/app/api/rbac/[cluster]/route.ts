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
    const [crResult, crbResult, rResult, rbResult, saResult] = await Promise.allSettled([
      execAsync(`kubectl get clusterroles -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }),
      execAsync(`kubectl get clusterrolebindings -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }),
      execAsync(`kubectl get roles -A -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }),
      execAsync(`kubectl get rolebindings -A -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }),
      execAsync(`kubectl get serviceaccounts -A -o json --context=${cluster}`, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }),
    ]);

    const parse = (r: PromiseSettledResult<{ stdout: string }>) => {
      if (r.status !== "fulfilled") return [];
      try { return JSON.parse(r.value.stdout).items || []; } catch { return []; }
    };

    const mapMeta = (item: Record<string, unknown>) => {
      const meta = (item.metadata || {}) as Record<string, unknown>;
      return { name: meta.name as string, namespace: meta.namespace as string | undefined };
    };

    const clusterRoles = parse(crResult).map((item: Record<string, unknown>) => {
      const rules = (item.rules || []) as Array<Record<string, unknown>>;
      return {
        ...mapMeta(item),
        rules: rules.map((r) => ({
          apiGroups: r.apiGroups,
          resources: r.resources,
          verbs: r.verbs,
        })),
        ruleCount: rules.length,
      };
    });

    const clusterRoleBindings = parse(crbResult).map((item: Record<string, unknown>) => {
      const roleRef = (item.roleRef || {}) as Record<string, unknown>;
      const subjects = (item.subjects || []) as Array<Record<string, unknown>>;
      return {
        ...mapMeta(item),
        roleRef: { kind: roleRef.kind, name: roleRef.name },
        subjects: subjects.map((s) => ({
          kind: s.kind,
          name: s.name,
          namespace: s.namespace,
        })),
      };
    });

    const roles = parse(rResult).map((item: Record<string, unknown>) => {
      const rules = (item.rules || []) as Array<Record<string, unknown>>;
      return {
        ...mapMeta(item),
        rules: rules.map((r) => ({
          apiGroups: r.apiGroups,
          resources: r.resources,
          verbs: r.verbs,
        })),
        ruleCount: rules.length,
      };
    });

    const roleBindings = parse(rbResult).map((item: Record<string, unknown>) => {
      const roleRef = (item.roleRef || {}) as Record<string, unknown>;
      const subjects = (item.subjects || []) as Array<Record<string, unknown>>;
      return {
        ...mapMeta(item),
        roleRef: { kind: roleRef.kind, name: roleRef.name },
        subjects: subjects.map((s) => ({
          kind: s.kind,
          name: s.name,
          namespace: s.namespace,
        })),
      };
    });

    const serviceAccounts = parse(saResult).map((item: Record<string, unknown>) => mapMeta(item));

    return NextResponse.json({
      clusterRoles: clusterRoles.filter((r: { name: string }) => !r.name.startsWith("system:")),
      clusterRoleBindings: clusterRoleBindings.filter((r: { name: string }) => !r.name.startsWith("system:")),
      roles,
      roleBindings,
      serviceAccounts: serviceAccounts.filter((sa: { namespace: string | undefined }) => sa.namespace !== "kube-system" && sa.namespace !== "kube-public"),
    });
  } catch {
    return NextResponse.json({ clusterRoles: [], clusterRoleBindings: [], roles: [], roleBindings: [], serviceAccounts: [] });
  }
}
