import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import {
  getModel,
  getProviderApiKey,
  isChatProvider,
  type ChatProvider,
} from "@/lib/ai/providers";
import { SIPOC_SYSTEM_PROMPT, sipocTools } from "@/lib/ai/sipocTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatBody = {
  messages: UIMessage[];
  provider?: ChatProvider;
  model?: string;
};

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider ?? "anthropic";
  if (!isChatProvider(provider)) {
    return NextResponse.json(
      { error: "provider must be anthropic, openai, or grok" },
      { status: 400 },
    );
  }

  if (!getProviderApiKey(provider)) {
    const envHint =
      provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : provider === "openai"
          ? "OPENAI_API_KEY"
          : "XAI_API_KEY";
    return NextResponse.json(
      {
        error: `Missing ${envHint}. Add it to your environment and restart the server.`,
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  try {
    const model = getModel(provider, body.model);
    const result = streamText({
      model,
      system: SIPOC_SYSTEM_PROMPT,
      messages: await convertToModelMessages(body.messages),
      tools: sipocTools,
      stopWhen: stepCountIs(12),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools: sipocTools,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
