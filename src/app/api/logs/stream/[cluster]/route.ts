import { NextRequest } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  const url = new URL(request.url);
  const pod = url.searchParams.get("pod");
  const namespace = url.searchParams.get("namespace") || "default";
  const container = url.searchParams.get("container");
  const tailLines = url.searchParams.get("tail") || "100";
  const follow = url.searchParams.get("follow") === "true";

  if (!pod) {
    return new Response(JSON.stringify({ error: "pod parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const containerFlag = container ? ` -c ${container}` : "";

  if (!follow) {
    try {
      const { stdout } = await execAsync(
        `kubectl logs ${pod} -n ${namespace}${containerFlag} --tail=${tailLines} --context=${cluster}`,
        { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
      );
      return new Response(JSON.stringify({ logs: stdout }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch logs";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const args = ["logs", pod, "-n", namespace, "--tail=" + tailLines, "-f", "--context=" + cluster];
  if (container) args.push("-c", container);

  const proc = spawn("kubectl", args);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      proc.stdout.on("data", (chunk: Buffer) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.toString())}\n\n`));
        } catch {
          proc.kill();
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify("[stderr] " + chunk.toString())}\n\n`));
        } catch {
          proc.kill();
        }
      });

      proc.on("close", () => {
        try {
          controller.enqueue(encoder.encode("data: \"[stream closed]\"\n\n"));
          controller.close();
        } catch {}
      });

      proc.on("error", () => {
        try {
          controller.close();
        } catch {}
      });

      request.signal.addEventListener("abort", () => {
        proc.kill();
      });
    },
    cancel() {
      proc.kill();
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
