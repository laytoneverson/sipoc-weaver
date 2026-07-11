"use client";

import { memo } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { healthFromScore } from "@/lib/holeDetection";
import { getNodeDegree } from "@/lib/graphUtils";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { Badge } from "@/components/ui/badge";

export type ProcessNodeData = {
  processId: string;
};

export type ProcessFlowNode = Node<ProcessNodeData, "process">;

const healthBorder: Record<"green" | "yellow" | "red", string> = {
  green: "border-emerald-500/70 shadow-emerald-500/10",
  yellow: "border-amber-500/70 shadow-amber-500/10",
  red: "border-rose-500/70 shadow-rose-500/10",
};

const healthDot: Record<"green" | "yellow" | "red", string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
};

function ProcessNodeComponent({ data, selected }: NodeProps<ProcessFlowNode>) {
  const process = useWorkspaceStore((s) =>
    s.workspace.processes.find((p) => p.id === data.processId),
  );
  const connections = useWorkspaceStore((s) => s.workspace.connections);
  // Return a primitive — filtering inside the selector creates a new array each
  // snapshot and triggers React's "getSnapshot should be cached" infinite loop.
  const issueCount = useWorkspaceStore((s) => {
    const issues = s.analysis?.issues;
    if (!issues) return 0;
    let n = 0;
    for (const i of issues) {
      if (
        i.processId === data.processId &&
        (i.severity === "high" || i.severity === "medium")
      ) {
        n++;
      }
    }
    return n;
  });
  const highlighted = useWorkspaceStore((s) =>
    s.highlightProcessIds.has(data.processId),
  );
  const openEditor = useWorkspaceStore((s) => s.openEditor);

  if (!process) return null;

  const score = process.completenessScore ?? 0;
  const health = healthFromScore(score);
  const degree = getNodeDegree(process.id, connections);

  return (
    <div
      className={cn(
        "w-[280px] rounded-xl border-2 bg-[var(--card)] shadow-lg transition-all",
        healthBorder[health],
        selected && "ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--background)]",
        highlighted && "scale-[1.02] ring-2 ring-sky-400/80",
      )}
      onDoubleClick={() => openEditor(process.id)}
    >
      <div className="flex items-start gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", healthDot[health])} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">
            {process.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <span>{score}% complete</span>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              <ArrowDownToLine className="h-2.5 w-2.5" />
              {degree.in}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <ArrowUpFromLine className="h-2.5 w-2.5" />
              {degree.out}
            </span>
          </div>
        </div>
        {issueCount > 0 && (
          <Badge variant="danger" className="shrink-0 gap-1 px-1.5">
            <AlertTriangle className="h-3 w-3" />
            {issueCount}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-[10px]">
        <div>
          <div className="mb-1 font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Inputs
          </div>
          <div className="space-y-1">
            {(process.inputs.length ? process.inputs : [{ id: "empty-in", name: "—" }]).slice(0, 4).map((inp) => (
              <div key={inp.id} className="relative flex items-center">
                {process.inputs.length > 0 && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`in-${inp.id}`}
                    className="!h-2.5 !w-2.5 !border-2 !border-[var(--card)] !bg-sky-400"
                    style={{ left: -14 }}
                  />
                )}
                <span className="truncate rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
                  {inp.name}
                </span>
              </div>
            ))}
            {process.inputs.length > 4 && (
              <div className="text-[var(--muted-foreground)]">
                +{process.inputs.length - 4} more
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 text-right font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Outputs
          </div>
          <div className="space-y-1">
            {(process.outputs.length ? process.outputs : [{ id: "empty-out", name: "—" }]).slice(0, 4).map((out) => (
              <div key={out.id} className="relative flex items-center justify-end">
                <span className="truncate rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300">
                  {out.name}
                </span>
                {process.outputs.length > 0 && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`out-${out.id}`}
                    className="!h-2.5 !w-2.5 !border-2 !border-[var(--card)] !bg-violet-400"
                    style={{ right: -14 }}
                  />
                )}
              </div>
            ))}
            {process.outputs.length > 4 && (
              <div className="text-right text-[var(--muted-foreground)]">
                +{process.outputs.length - 4} more
              </div>
            )}
          </div>
        </div>
      </div>

      {process.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--border)] px-3 py-1.5">
          {process.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[9px] text-[var(--muted-foreground)]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Fallback handles when no I/O defined */}
      {process.inputs.length === 0 && (
        <Handle
          type="target"
          position={Position.Left}
          id="in-default"
          className="!h-2.5 !w-2.5 !bg-sky-400/50"
        />
      )}
      {process.outputs.length === 0 && (
        <Handle
          type="source"
          position={Position.Right}
          id="out-default"
          className="!h-2.5 !w-2.5 !bg-violet-400/50"
        />
      )}
    </div>
  );
}

export const ProcessNode = memo(ProcessNodeComponent);
