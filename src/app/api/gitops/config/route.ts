import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const context = searchParams.get("context");

  if (!context) {
    return NextResponse.json({ error: "context is required" }, { status: 400 });
  }

  const config = await prisma.gitConfig.findUnique({
    where: { contextName: context },
  });

  return NextResponse.json({
    repoOwner: config?.repoOwner || "",
    repoName: config?.repoName || "",
    baseBranch: config?.baseBranch || "main",
    targetPath: config?.targetPath || "k8s/",
    hasToken: !!config?.githubToken,
  });
}

export async function PUT(request: Request) {
  try {
    const { context, repoOwner, repoName, baseBranch, targetPath, githubToken } = await request.json();

    if (!context) {
      return NextResponse.json({ error: "context is required" }, { status: 400 });
    }

    const data: Record<string, string> = {};
    if (repoOwner !== undefined) data.repoOwner = repoOwner;
    if (repoName !== undefined) data.repoName = repoName;
    if (baseBranch !== undefined) data.baseBranch = baseBranch;
    if (targetPath !== undefined) data.targetPath = targetPath;
    if (githubToken !== undefined) data.githubToken = githubToken;

    await prisma.gitConfig.upsert({
      where: { contextName: context },
      create: {
        contextName: context,
        repoOwner: repoOwner || "",
        repoName: repoName || "",
        baseBranch: baseBranch || "main",
        targetPath: targetPath || "k8s/",
        githubToken: githubToken || "",
      },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
