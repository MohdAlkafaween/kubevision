import { watchAllResources } from "@/lib/k8s/watcher";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const contextName = decodeURIComponent(cluster);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const handles = await watchAllResources(contextName, (event) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        });

        const keepAlive = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 30000);

        _request.signal.addEventListener("abort", () => {
          clearInterval(keepAlive);
          handles.forEach((h) => h.abort());
          controller.close();
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Watch failed";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
