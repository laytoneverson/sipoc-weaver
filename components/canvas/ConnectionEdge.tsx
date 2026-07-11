"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspaceStore";

export type ConnectionEdgeData = {
  connectionId: string;
  label?: string;
};

export type ConnectionFlowEdge = Edge<ConnectionEdgeData, "connection">;

export function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ConnectionFlowEdge>) {
  const highlighted = useWorkspaceStore((s) =>
    s.highlightEdgeIds.has(data?.connectionId ?? id),
  );
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: highlighted || selected ? "#38bdf8" : "#64748b",
          strokeWidth: highlighted || selected ? 2.5 : 1.5,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-none absolute rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] shadow",
              (highlighted || selected) && "border-sky-500/50 text-sky-300",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
