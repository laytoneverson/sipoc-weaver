export type ChatProvider = "anthropic" | "openai" | "grok";

export const CHAT_PROVIDERS: {
  id: ChatProvider;
  label: string;
  envKey: string;
  defaultModel: string;
}[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
  },
  {
    id: "grok",
    label: "Grok",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-3",
  },
];

export function isChatProvider(value: unknown): value is ChatProvider {
  return value === "anthropic" || value === "openai" || value === "grok";
}
