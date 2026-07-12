import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

const DANGEROUS_PATTERNS = [
  /kubectl\s+delete\s+namespace/i,
  /kubectl\s+delete\s+ns\s/i,
  /kubectl\s+cluster-info\s+dump/i,
  /kubectl\s+drain\s/i,
];

const GATED_PATTERNS: Record<string, "allowExec" | "allowDelete" | "allowApply"> = {
  "exec": "allowExec",
  "cp": "allowExec",
  "attach": "allowExec",
  "port-forward": "allowExec",
  "delete": "allowDelete",
  "apply": "allowApply",
  "create": "allowApply",
  "replace": "allowApply",
  "patch": "allowApply",
};

function extractSubcommand(command: string): string | null {
  const parts = command.trim().split(/\s+/);
  return parts.length >= 2 ? parts[1] : null;
}

export async function POST(request: Request) {
  try {
    const { command, context } = await request.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "command is required" }, { status: 400 });
    }

    if (!command.trim().startsWith("kubectl")) {
      return NextResponse.json(
        { error: "Only kubectl commands are allowed" },
        { status: 403 }
      );
    }

    const sanitized = command.replace(/[;&|`$(){}]/g, "");

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sanitized)) {
        return NextResponse.json(
          { error: "This command is blocked for safety" },
          { status: 403 }
        );
      }
    }

    let config = null;
    if (context) {
      config = await prisma.clusterConfig.findUnique({
        where: { contextName: context },
      });
    }

    const subcommand = extractSubcommand(sanitized);
    if (subcommand && subcommand in GATED_PATTERNS) {
      const requiredPerm = GATED_PATTERNS[subcommand];
      const allowed = config?.[requiredPerm] ?? false;
      if (!allowed) {
        return NextResponse.json(
          {
            error: `"kubectl ${subcommand}" is disabled for this cluster. Enable it in Cluster Settings.`,
          },
          { status: 403 }
        );
      }
    }

    let fullCommand = sanitized;
    if (context) {
      fullCommand += ` --context=${context}`;
    }

    if (config?.impersonateUser) {
      fullCommand += ` --as=${config.impersonateUser}`;
    }
    if (config?.impersonateGroups) {
      const groups = config.impersonateGroups.split(",").map((g) => g.trim()).filter(Boolean);
      for (const group of groups) {
        fullCommand += ` --as-group=${group}`;
      }
    }

    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    logAudit("exec", subcommand || "kubectl", sanitized, context);

    return NextResponse.json({
      stdout: stdout || "",
      stderr: stderr || "",
      success: true,
    });
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      stdout: execError.stdout || "",
      stderr: execError.stderr || execError.message || "Command failed",
      success: false,
    });
  }
}
