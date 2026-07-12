import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const LOG_DIR = path.join(process.cwd(), "data", "logs");

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getDirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const p = path.join(dir, entry);
    const stat = fs.statSync(p);
    if (stat.isFile()) total += stat.size;
    else if (stat.isDirectory()) total += getDirSize(p);
  }
  return total;
}

export async function GET() {
  ensureDir();
  const size = getDirSize(LOG_DIR);
  const files = fs.existsSync(LOG_DIR)
    ? fs.readdirSync(LOG_DIR).map((f) => {
        const stat = fs.statSync(path.join(LOG_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
      })
    : [];

  return NextResponse.json({
    totalBytes: size,
    totalFormatted: formatBytes(size),
    files,
  });
}

export async function DELETE() {
  ensureDir();
  const entries = fs.readdirSync(LOG_DIR);
  for (const entry of entries) {
    fs.unlinkSync(path.join(LOG_DIR, entry));
  }
  return NextResponse.json({ cleared: true });
}

export async function POST(request: Request) {
  ensureDir();
  const body = await request.json();
  const { filename, content } = body;
  if (!filename || !content) {
    return NextResponse.json({ error: "filename and content required" }, { status: 400 });
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  fs.writeFileSync(path.join(LOG_DIR, safe), content, "utf-8");
  return NextResponse.json({ saved: safe });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}
