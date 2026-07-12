import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  try {
    const cmd = query
      ? `helm search repo ${query} --output=json`
      : `helm search repo "" --output=json`;
    const { stdout } = await execAsync(cmd, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
    const charts = JSON.parse(stdout || "[]");
    return NextResponse.json({ charts });
  } catch {
    return NextResponse.json({ charts: [] });
  }
}
