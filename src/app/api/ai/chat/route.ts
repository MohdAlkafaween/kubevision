import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  try {
    const { messages, systemPrompt } = (await request.json()) as {
      messages: ChatMessage[];
      systemPrompt?: string;
    };

    const config = await prisma.aiConfig.findUnique({
      where: { id: "singleton" },
    });

    if (!config || !config.apiKey) {
      return new Response(
        JSON.stringify({ error: "AI not configured. Go to Settings to add your API key." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const fullMessages: ChatMessage[] = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    fullMessages.push(...messages);

    if (config.provider === "anthropic") {
      return streamAnthropic(config, fullMessages);
    }

    return streamOpenAI(config, fullMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function streamOpenAI(
  config: { apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number },
  messages: ChatMessage[]
) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return new Response(JSON.stringify({ error: `API error: ${res.status} ${errorText}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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

async function streamAnthropic(
  config: { apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number },
  messages: ChatMessage[]
) {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemMsg?.content || "",
      messages: chatMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return new Response(JSON.stringify({ error: `API error: ${res.status} ${errorText}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            try {
              const json = JSON.parse(data);
              if (json.type === "content_block_delta" && json.delta?.text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: json.delta.text })}\n\n`)
                );
              }
            } catch {
              // skip
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
