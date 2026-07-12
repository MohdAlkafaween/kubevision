import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { prisma } from "@/lib/db";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { yaml, context } = await request.json();

    if (!yaml || typeof yaml !== "string") {
      return NextResponse.json({ error: "yaml is required" }, { status: 400 });
    }

    if (!context) {
      return NextResponse.json({ error: "context is required" }, { status: 400 });
    }

    const config = await prisma.clusterConfig.findUnique({
      where: { contextName: context },
    });

    if (!config?.allowApply) {
      return NextResponse.json(
        { error: "Apply is disabled for this cluster. Enable it in Cluster Settings." },
        { status: 403 }
      );
    }

    const tmpFile = join(tmpdir(), `kubevision-apply-${Date.now()}.yaml`);
    await writeFile(tmpFile, yaml, "utf-8");

    try {
      let command = `kubectl apply -f "${tmpFile}" --context=${context}`;

      if (config.impersonateUser) {
        command += ` --as=${config.impersonateUser}`;
      }
      if (config.impersonateGroups) {
        const groups = config.impersonateGroups.split(",").map((g) => g.trim()).filter(Boolean);
        for (const group of groups) {
          command += ` --as-group=${group}`;
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });

      return NextResponse.json({
        stdout: stdout || "",
        stderr: stderr || "",
        success: true,
      });
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      stdout: execError.stdout || "",
      stderr: execError.stderr || execError.message || "Apply failed",
      success: false,
    });
  }
}
