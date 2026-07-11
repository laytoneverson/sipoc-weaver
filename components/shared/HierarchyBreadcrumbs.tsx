"use client";

import { ChevronRight, CornerLeftUp, Home } from "lucide-react";
import { getFocusBreadcrumbs } from "@/lib/hierarchy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspaceStore";

export function HierarchyBreadcrumbs({
  className,
  showUpButton = true,
}: {
  className?: string;
  showUpButton?: boolean;
}) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const focusParentId = useWorkspaceStore((s) => s.focusParentId);
  const setFocusParent = useWorkspaceStore((s) => s.setFocusParent);
  const drillUp = useWorkspaceStore((s) => s.drillUp);

  const crumbs = getFocusBreadcrumbs(workspace.processes, focusParentId);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {showUpButton && focusParentId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => drillUp()}
          title="Go up one level"
        >
          <CornerLeftUp className="h-3.5 w-3.5" />
          Up
        </Button>
      )}
      <nav className="flex flex-wrap items-center gap-0.5 text-xs">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <span key={crumb.id ?? "root"} className="flex items-center gap-0.5">
              {idx > 0 && (
                <ChevronRight className="h-3 w-3 text-[var(--muted-foreground)]" />
              )}
              <button
                type="button"
                disabled={isLast}
                onClick={() => setFocusParent(crumb.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition",
                  isLast
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
                )}
              >
                {idx === 0 && <Home className="h-3 w-3" />}
                {crumb.name}
              </button>
            </span>
          );
        })}
      </nav>
    </div>
  );
}
