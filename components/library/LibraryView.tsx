"use client";

import Fuse from "fuse.js";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
} from "lucide-react";
import { healthFromScore } from "@/lib/holeDetection";
import { getNodeDegree } from "@/lib/graphUtils";
import { formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useWorkspaceStore } from "@/store/workspaceStore";

export function LibraryView() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysis = useWorkspaceStore((s) => s.analysis);
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery);
  const healthFilter = useWorkspaceStore((s) => s.healthFilter);
  const setHealthFilter = useWorkspaceStore((s) => s.setHealthFilter);
  const holesOnly = useWorkspaceStore((s) => s.holesOnly);
  const setHolesOnly = useWorkspaceStore((s) => s.setHolesOnly);
  const tagFilter = useWorkspaceStore((s) => s.tagFilter);
  const setTagFilter = useWorkspaceStore((s) => s.setTagFilter);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const setView = useWorkspaceStore((s) => s.setView);
  const openEditor = useWorkspaceStore((s) => s.openEditor);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    workspace.processes.forEach((p) => p.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [workspace.processes]);

  const fuse = useMemo(
    () =>
      new Fuse(workspace.processes, {
        keys: [
          "name",
          "description",
          "owner",
          "tags",
          "steps",
          "inputs.name",
          "outputs.name",
        ],
        threshold: 0.4,
      }),
    [workspace.processes],
  );

  const filtered = useMemo(() => {
    let list =
      searchQuery.trim().length > 0
        ? fuse.search(searchQuery).map((r) => r.item)
        : workspace.processes;

    list = list.filter((p) => {
      const health = healthFromScore(p.completenessScore ?? 0);
      if (healthFilter !== "all" && health !== healthFilter) return false;
      if (tagFilter && !p.tags.includes(tagFilter)) return false;
      if (holesOnly) {
        const has = analysis?.issues.some(
          (i) =>
            i.processId === p.id &&
            (i.severity === "high" || i.severity === "medium"),
        );
        if (!has) return false;
      }
      return true;
    });

    return list;
  }, [
    workspace.processes,
    fuse,
    searchQuery,
    healthFilter,
    tagFilter,
    holesOnly,
    analysis,
  ]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Process library</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {filtered.length} of {workspace.processes.length} processes
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
          <Input
            className="pl-8"
            placeholder="Search name, steps, I/O…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          className="w-36"
          value={healthFilter}
          onChange={(e) =>
            setHealthFilter(e.target.value as typeof healthFilter)
          }
        >
          <option value="all">All health</option>
          <option value="green">Healthy</option>
          <option value="yellow">Needs work</option>
          <option value="red">Critical</option>
        </Select>
        <Select
          className="w-40"
          value={tagFilter ?? ""}
          onChange={(e) => setTagFilter(e.target.value || null)}
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <input
            type="checkbox"
            checked={holesOnly}
            onChange={(e) => setHolesOnly(e.target.checked)}
            className="rounded"
          />
          Has holes
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
          No processes match your filters.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto pb-8 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const health = healthFromScore(p.completenessScore ?? 0);
            const degree = getNodeDegree(p.id, workspace.connections);
            const issueCount =
              analysis?.issues.filter(
                (i) =>
                  i.processId === p.id &&
                  (i.severity === "high" || i.severity === "medium"),
              ).length ?? 0;

            return (
              <Card
                key={p.id}
                className="cursor-pointer transition hover:border-[var(--ring)]"
                onClick={() => {
                  selectProcess(p.id);
                  setView("map");
                }}
                onDoubleClick={() => openEditor(p.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge
                      variant={
                        health === "green"
                          ? "success"
                          : health === "yellow"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {p.completenessScore ?? 0}%
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-xs text-[var(--muted-foreground)]">
                    {p.description || p.steps[0] || "No description"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownToLine className="h-3 w-3" />
                      {degree.in} in
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpFromLine className="h-3 w-3" />
                      {degree.out} out
                    </span>
                    {issueCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-400">
                        <AlertTriangle className="h-3 w-3" />
                        {issueCount} issues
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    Updated {formatRelative(p.updatedAt)}
                    {p.owner ? ` · ${p.owner}` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
