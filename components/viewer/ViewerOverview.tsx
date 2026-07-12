"use client";

import { useMemo } from "react";
import { ArrowRight, Layers, ListOrdered } from "lucide-react";
import { getLayoutedElements, workspaceToFlow } from "@/lib/layout";
import { getChildCount, getScopedProcesses } from "@/lib/hierarchy";
import { healthFromScore } from "@/lib/holeDetection";
import { cn } from "@/lib/utils";
import type { Connection, Process, Workspace } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CARD_W = 220;
const CARD_H = 120;

const healthBorder: Record<"green" | "yellow" | "red", string> = {
  green: "border-emerald-500/60",
  yellow: "border-amber-500/60",
  red: "border-rose-500/60",
};

const healthDot: Record<"green" | "yellow" | "red", string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
};

function layoutScoped(
  processes: Process[],
  connections: Connection[],
): Map<string, { x: number; y: number }> {
  const scoped: Workspace = {
    id: "viewer",
    name: "viewer",
    schemaVersion: 2,
    processes,
    connections: connections.filter(
      (c) =>
        processes.some((p) => p.id === c.fromProcessId) &&
        processes.some((p) => p.id === c.toProcessId),
    ),
    createdAt: "",
    updatedAt: "",
  };
  const { nodes, edges } = workspaceToFlow(scoped);
  const hasPositions = processes.every((p) => p.position);
  if (hasPositions && processes.length > 0) {
    return new Map(
      processes.map((p) => [
        p.id,
        { x: p.position!.x, y: p.position!.y },
      ]),
    );
  }
  const layouted = getLayoutedElements(nodes, edges, "LR");
  return new Map(
    layouted.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
  );
}

export function ViewerOverview({
  workspace,
  focusParentId,
  onOpenDetail,
  onDescend,
}: {
  workspace: Workspace;
  focusParentId: string | null;
  onOpenDetail: (processId: string) => void;
  onDescend: (processId: string) => void;
}) {
  const scoped = useMemo(
    () => getScopedProcesses(workspace.processes, focusParentId),
    [workspace.processes, focusParentId],
  );

  const positions = useMemo(
    () => layoutScoped(scoped, workspace.connections),
    [scoped, workspace.connections],
  );

  const scopedConnections = useMemo(
    () =>
      workspace.connections.filter(
        (c) =>
          scoped.some((p) => p.id === c.fromProcessId) &&
          scoped.some((p) => p.id === c.toProcessId),
      ),
    [workspace.connections, scoped],
  );

  const bounds = useMemo(() => {
    if (scoped.length === 0) {
      return { width: 640, height: 360, minX: 0, minY: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of scoped) {
      const pos = positions.get(p.id) ?? { x: 0, y: 0 };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + CARD_W);
      maxY = Math.max(maxY, pos.y + CARD_H);
    }
    const pad = 48;
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: Math.max(maxX - minX + pad * 2, 640),
      height: Math.max(maxY - minY + pad * 2, 360),
    };
  }, [scoped, positions]);

  if (scoped.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-sm text-[var(--muted-foreground)]">
        No processes at this level. Use the breadcrumb to go up, or open Map to
        add processes.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-auto">
      <div
        className="relative mx-auto"
        style={{ width: bounds.width, height: bounds.height, minHeight: "100%" }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={bounds.width}
          height={bounds.height}
          aria-hidden
        >
          <defs>
            <marker
              id="viewer-arrow"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L10,4 L0,8 Z" fill="var(--muted-foreground)" />
            </marker>
          </defs>
          {scopedConnections.map((c) => {
            const from = positions.get(c.fromProcessId);
            const to = positions.get(c.toProcessId);
            if (!from || !to) return null;
            const x1 = from.x - bounds.minX + CARD_W;
            const y1 = from.y - bounds.minY + CARD_H / 2;
            const x2 = to.x - bounds.minX;
            const y2 = to.y - bounds.minY + CARD_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={c.id}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.45}
                strokeWidth={1.75}
                markerEnd="url(#viewer-arrow)"
              />
            );
          })}
        </svg>

        {scoped.map((p) => {
          const pos = positions.get(p.id) ?? { x: 0, y: 0 };
          const score = p.completenessScore ?? 0;
          const health = healthFromScore(score);
          const childCount = getChildCount(workspace.processes, p.id);
          const stepCount = p.steps.filter((s) => s.text.trim()).length;

          return (
            <article
              key={p.id}
              className={cn(
                "absolute flex flex-col rounded-xl border-2 bg-[var(--card)] shadow-md transition hover:shadow-lg",
                healthBorder[health],
              )}
              style={{
                left: pos.x - bounds.minX,
                top: pos.y - bounds.minY,
                width: CARD_W,
                height: CARD_H,
              }}
            >
              <button
                type="button"
                className="flex flex-1 flex-col items-start gap-1.5 px-3 py-2.5 text-left"
                onClick={() => onOpenDetail(p.id)}
              >
                <div className="flex w-full items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      healthDot[health],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold leading-tight">
                      {p.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-[var(--muted-foreground)]">
                      {p.description || "No description"}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1 px-1.5 text-[9px]">
                    <ListOrdered className="h-2.5 w-2.5" />
                    {stepCount} steps
                  </Badge>
                  {childCount > 0 && (
                    <Badge variant="secondary" className="gap-1 px-1.5 text-[9px]">
                      <Layers className="h-2.5 w-2.5" />
                      {childCount}
                    </Badge>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 py-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 flex-1 text-[10px]"
                  onClick={() => onOpenDetail(p.id)}
                >
                  View steps
                  <ArrowRight className="h-3 w-3" />
                </Button>
                {childCount > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[10px]"
                    onClick={() => onDescend(p.id)}
                  >
                    <Layers className="h-3 w-3" />
                    Descend
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
