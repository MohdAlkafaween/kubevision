import { NextResponse } from "next/server";
import { fetchClusterResources } from "@/lib/k8s/resources";
import { analyzeSecurityPosture } from "@/lib/k8s/security-checks";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);

  try {
    const resources = await fetchClusterResources(contextName);
    const posture = analyzeSecurityPosture(resources);
    return NextResponse.json(posture);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Security scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
