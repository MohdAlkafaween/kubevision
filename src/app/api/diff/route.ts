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

    const tmpFile = join(tmpdir(), `kubevision-diff-${Date.now()}.yaml`);
    await writeFile(tmpFile, yaml, "utf-8");

    try {
      let command = `kubectl diff -f "${tmpFile}" --context=${context}`;

      if (config?.impersonateUser) {
        command += ` --as=${config.impersonateUser}`;
      }
      if (config?.impersonateGroups) {
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
        diff: stdout || "",
        stderr: stderr || "",
        hasChanges: (stdout || "").trim().length > 0,
      });
    } catch (error) {
      const execError = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      // kubectl diff exits with code 1 when there ARE differences (not an error)
      if (execError.code === 1 && execError.stdout) {
        return NextResponse.json({
          diff: execError.stdout,
          stderr: execError.stderr || "",
          hasChanges: true,
        });
      }
      return NextResponse.json({
        diff: "",
        stderr: execError.stderr || execError.message || "Diff failed",
        hasChanges: false,
        error: true,
      });
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diff failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
