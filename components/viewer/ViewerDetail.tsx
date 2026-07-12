"use client";

import {
  ArrowLeft,
  Layers,
  Link2,
  User,
} from "lucide-react";
import { getChildCount } from "@/lib/hierarchy";
import { healthFromScore } from "@/lib/holeDetection";
import { cn } from "@/lib/utils";
import type { Process, Workspace } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const healthDot: Record<"green" | "yellow" | "red", string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
};

export function ViewerDetail({
  workspace,
  process,
  onBack,
  onOpenSubprocess,
  onDescend,
}: {
  workspace: Workspace;
  process: Process;
  onBack: () => void;
  onOpenSubprocess: (processId: string) => void;
  onDescend: (processId: string) => void;
}) {
  const score = process.completenessScore ?? 0;
  const health = healthFromScore(score);
  const childCount = getChildCount(workspace.processes, process.id);
  const steps = process.steps.filter((s) => s.text.trim());

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to altitude view
          </button>
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", healthDot[health])} />
            <h2 className="text-2xl font-semibold tracking-tight">{process.name}</h2>
          </div>
          {process.description && (
            <p className="max-w-2xl text-sm text-[var(--muted-foreground)]">
              {process.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--muted-foreground)]">
            {process.owner && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {process.owner}
              </span>
            )}
            <span>{score}% complete</span>
            {process.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                #{t}
              </Badge>
            ))}
          </div>
        </div>
        {childCount > 0 && (
          <Button size="sm" variant="secondary" onClick={() => onDescend(process.id)}>
            <Layers className="h-3.5 w-3.5" />
            Descend to children ({childCount})
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        <section className="min-w-0">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Process steps
          </h3>
          {steps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
              No steps defined for this process.
            </p>
          ) : (
            <ol className="relative space-y-0 border-l border-[var(--border)] ml-3">
              {steps.map((step, idx) => {
                const sub = step.subprocessId
                  ? workspace.processes.find((p) => p.id === step.subprocessId)
                  : undefined;
                return (
                  <li key={step.id} className="relative pb-5 pl-6 last:pb-0">
                    <span className="absolute -left-[9px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[10px] font-semibold">
                      {idx + 1}
                    </span>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-3">
                      <div className="text-sm font-medium leading-snug">
                        {step.text}
                      </div>
                      {sub && (
                        <button
                          type="button"
                          onClick={() => onOpenSubprocess(sub.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-teal-500/15 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-500/25 dark:text-teal-300"
                        >
                          <Link2 className="h-3 w-3" />
                          Zoom into “{sub.name}”
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="space-y-4">
          <SipocColumn title="Suppliers" items={process.suppliers.map((s) => s.name)} />
          <SipocColumn title="Inputs" items={process.inputs.map((i) => i.name)} tone="sky" />
          <SipocColumn title="Outputs" items={process.outputs.map((o) => o.name)} tone="violet" />
          <SipocColumn title="Customers" items={process.customers.map((c) => c.name)} />
        </aside>
      </div>
    </div>
  );
}

function SipocColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "sky" | "violet";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((name) => (
            <li
              key={name}
              className={cn(
                "truncate rounded px-1.5 py-0.5 text-[11px]",
                tone === "sky" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                tone === "violet" &&
                  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                !tone && "bg-[var(--secondary)] text-[var(--foreground)]",
              )}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
