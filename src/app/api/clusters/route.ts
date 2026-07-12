import { NextResponse } from "next/server";
import { getClusterContexts } from "@/lib/k8s/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const contexts = getClusterContexts();
    return NextResponse.json({ contexts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kubeconfig";
    return NextResponse.json(
      { error: message, contexts: [] },
      { status: 500 }
    );
  }
}
