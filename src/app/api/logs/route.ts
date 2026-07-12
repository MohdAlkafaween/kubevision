import { getCoreApi } from "@/lib/k8s/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const context = url.searchParams.get("context");
  const pod = url.searchParams.get("pod");
  const namespace = url.searchParams.get("namespace") || "default";
  const container = url.searchParams.get("container") || undefined;
  const tail = parseInt(url.searchParams.get("tail") || "200", 10);
  const previous = url.searchParams.get("previous") === "true";

  if (!context || !pod) {
    return new Response(JSON.stringify({ error: "context and pod are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const core = getCoreApi(context);
    const logResponse = await core.readNamespacedPodLog({
      name: pod,
      namespace,
      container,
      tailLines: tail,
      previous,
    });

    return new Response(logResponse as unknown as string, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch logs";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
