import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { stdout } = await execAsync("helm repo list --output=json", { timeout: 15000 });
    const repos = JSON.parse(stdout || "[]");
    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ repos: [] });
  }
}

export async function POST(request: Request) {
  const { name, url } = await request.json();

  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  try {
    await execAsync(`helm repo add ${name} ${url}`, { timeout: 30000 });
    await execAsync("helm repo update", { timeout: 60000 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { name } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    await execAsync(`helm repo remove ${name}`, { timeout: 15000 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
