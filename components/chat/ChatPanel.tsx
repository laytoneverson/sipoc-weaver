"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { Loader2, MessageSquare, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  CHAT_PROVIDERS,
  type ChatProvider,
  isChatProvider,
} from "@/lib/ai/providerTypes";

const PROVIDER_STORAGE_KEY = "sipoc-weaver:chat-provider";

function loadProvider(): ChatProvider {
  if (typeof window === "undefined") return "anthropic";
  const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return isChatProvider(raw) ? raw : "anthropic";
}

function ToolChip({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const state = part.state;
  const ok = state === "output-available";
  const err = state === "output-error";
  const pending =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested" ||
    state === "approval-responded";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px]",
        ok &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        err &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        pending &&
          "border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]",
      )}
      title={err && "errorText" in part ? String(part.errorText) : name}
    >
      {pending && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {name}
      {ok ? " ✓" : err ? " ✗" : ""}
    </span>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const textParts = message.parts.filter((p) => p.type === "text");
  const toolParts = message.parts.filter((p) => isToolUIPart(p));

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
      )}
    >
      {toolParts.length > 0 && (
        <div className="flex max-w-[95%] flex-wrap gap-1">
          {toolParts.map((part, i) => (
            <ToolChip key={`${message.id}-tool-${i}`} part={part} />
          ))}
        </div>
      )}
      {textParts.map((part, i) =>
        part.type === "text" && part.text.trim() ? (
          <div
            key={`${message.id}-text-${i}`}
            className={cn(
              "max-w-[95%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
              isUser
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--secondary)] text-[var(--foreground)]",
            )}
          >
            {part.text}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function ChatPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [provider, setProvider] = useState<ChatProvider>("anthropic");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef(provider);

  useEffect(() => {
    setProvider(loadProvider());
  }, []);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          provider: providerRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport,
    onError: (err) => {
      toast.error(err.message || "Chat request failed");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    setInput("");
    void sendMessage({ text });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right">
      <SheetHeader onClose={() => onOpenChange(false)}>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
          <SheetTitle className="text-base">AI assistant</SheetTitle>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Build and fix SIPOC processes with live workspace edits
        </p>
        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          Provider
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              if (!isChatProvider(next)) return;
              setProvider(next);
              localStorage.setItem(PROVIDER_STORAGE_KEY, next);
            }}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] outline-none"
          >
            {CHAT_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </SheetHeader>

      <SheetBody className="flex flex-col gap-3 !px-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
            Ask me to build or fix SIPOC processes
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error.message}
          </div>
        )}
        <div ref={bottomRef} />
      </SheetBody>

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t border-[var(--border)] p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a process or ask to fix gaps…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => stop()}
            title="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} title="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </Sheet>
  );
}
