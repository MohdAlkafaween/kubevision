import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SINGLETON_ID = "singleton";

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

export async function GET() {
  let config = await prisma.aiConfig.findUnique({ where: { id: SINGLETON_ID } });

  if (!config) {
    config = await prisma.aiConfig.create({
      data: { id: SINGLETON_ID },
    });
  }

  return NextResponse.json({
    config: {
      provider: config.provider,
      apiKey: maskKey(config.apiKey),
      hasKey: config.apiKey.length > 0,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { provider, apiKey, baseUrl, model, temperature, maxTokens } = body;

    const data: Record<string, unknown> = {};
    if (provider !== undefined) data.provider = provider;
    if (apiKey !== undefined && !apiKey.includes("••••")) data.apiKey = apiKey;
    if (baseUrl !== undefined) data.baseUrl = baseUrl;
    if (model !== undefined) data.model = model;
    if (temperature !== undefined) data.temperature = parseFloat(temperature);
    if (maxTokens !== undefined) data.maxTokens = parseInt(maxTokens, 10);

    await prisma.aiConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
