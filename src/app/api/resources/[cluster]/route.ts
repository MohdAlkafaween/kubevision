import { NextResponse } from "next/server";
import { fetchClusterResources } from "@/lib/k8s/resources";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  try {
    const resources = await fetchClusterResources(decodeURIComponent(cluster));
    return NextResponse.json(resources);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch resources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
