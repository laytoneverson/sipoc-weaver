import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import {
  CHAT_PROVIDERS,
  type ChatProvider,
} from "@/lib/ai/providerTypes";

export type { ChatProvider } from "@/lib/ai/providerTypes";
export { CHAT_PROVIDERS, isChatProvider } from "@/lib/ai/providerTypes";

export function getProviderApiKey(provider: ChatProvider): string | undefined {
  const meta = CHAT_PROVIDERS.find((p) => p.id === provider);
  if (!meta) return undefined;
  const key = process.env[meta.envKey]?.trim();
  return key || undefined;
}

export function getDefaultModel(provider: ChatProvider): string {
  return (
    CHAT_PROVIDERS.find((p) => p.id === provider)?.defaultModel ??
    "claude-sonnet-4-5"
  );
}

export function getModel(
  provider: ChatProvider,
  model?: string,
): LanguageModel {
  const id = model?.trim() || getDefaultModel(provider);
  switch (provider) {
    case "anthropic":
      return anthropic(id);
    case "openai":
      return openai(id);
    case "grok":
      return xai(id);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
