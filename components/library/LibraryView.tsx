"use client";

import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Map as MapIcon,
  Search,
} from "lucide-react";
import { healthFromScore } from "@/lib/holeDetection";
import {
  buildProcessTree,
  getChildCount,
  getProcessDepth,
  type ProcessTreeNode,
} from "@/lib/hierarchy";
import { formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { HierarchyBreadcrumbs } from "@/components/shared/HierarchyBreadcrumbs";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useAuthStore } from "@/store/authStore";
import { ouName } from "@/lib/orgUtils";
import type { Process } from "@/lib/types";

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
  const focusParentId = useWorkspaceStore((s) => s.focusParentId);
  const setFocusParent = useWorkspaceStore((s) => s.setFocusParent);
  const drillInto = useWorkspaceStore((s) => s.drillInto);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const setView = useWorkspaceStore((s) => s.setView);
  const openEditor = useWorkspaceStore((s) => s.openEditor);
  const organization = useAuthStore((s) => s.organization);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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
          "steps.text",
          "inputs.name",
          "outputs.name",
        ],
        threshold: 0.4,
      }),
    [workspace.processes],
  );

  const matchesFilters = (p: Process) => {
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
  };

  const searching = searchQuery.trim().length > 0;

  const flatSearchResults = useMemo(() => {
    if (!searching) return [];
    return fuse
      .search(searchQuery)
      .map((r) => r.item)
      .filter(matchesFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searching,
    fuse,
    searchQuery,
    healthFilter,
    tagFilter,
    holesOnly,
    analysis,
    workspace.processes,
  ]);

  const tree = useMemo(
    () => buildProcessTree(workspace.processes),
    [workspace.processes],
  );

  const filterTree = (nodes: ProcessTreeNode[]): ProcessTreeNode[] => {
    return nodes
      .map((n) => {
        const children = filterTree(n.children);
        const selfOk = matchesFilters(n.process);
        if (selfOk || children.length > 0) {
          return { ...n, children };
        }
        return null;
      })
      .filter(Boolean) as ProcessTreeNode[];
  };

  const filteredTree = useMemo(
    () => filterTree(tree),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, healthFilter, tagFilter, holesOnly, analysis],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToMapAt = (processId: string | null, selectId?: string) => {
    setFocusParent(processId);
    if (selectId) selectProcess(selectId);
    setView("map");
  };

  const renderNode = (node: ProcessTreeNode) => {
    const { process: p, children, depth } = node;
    const hasKids = children.length > 0;
    const isOpen = expanded.has(p.id) || depth < 1;
    const health = healthFromScore(p.completenessScore ?? 0);
    const issueCount =
      analysis?.issues.filter(
        (i) =>
          i.processId === p.id &&
          (i.severity === "high" || i.severity === "medium"),
      ).length ?? 0;
    const linkedSteps = p.steps.filter((s) => s.subprocessId).length;
    const isFocused = focusParentId === p.id;

    return (
      <div key={p.id}>
        <div
          className={`group flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-[var(--border)] hover:bg-[var(--accent)]/40 ${
            isFocused ? "border-[var(--ring)] bg-[var(--accent)]/30" : ""
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)]"
            onClick={() => (hasKids ? toggleExpand(p.id) : undefined)}
            aria-label={hasKids ? "Toggle children" : undefined}
          >
            {hasKids ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => openEditor(p.id)}
            onDoubleClick={() => {
              if (hasKids) drillInto(p.id);
              else goToMapAt(p.parentProcessId ?? null, p.id);
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{p.name}</span>
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
              {hasKids && (
                <Badge variant="secondary" className="gap-1">
                  <Layers className="h-3 w-3" />
                  {children.length}
                </Badge>
              )}
              {linkedSteps > 0 && (
                <span className="text-[10px] text-teal-400">
                  {linkedSteps} linked step{linkedSteps === 1 ? "" : "s"}
                </span>
              )}
              {issueCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-400">
                  <AlertTriangle className="h-3 w-3" />
                  {issueCount}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-[var(--muted-foreground)]">
              {p.description ||
                p.steps[0]?.text ||
                "No description"}
              {" · "}
              {ouName(organization, p.ouId)}
              {" · "}
              L{getProcessDepth(workspace.processes, p.id) + 1}
              {" · "}
              {formatRelative(p.updatedAt)}
            </p>
          </button>

          <div className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100">
            {hasKids && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => drillInto(p.id)}
                title="Drill into children on map"
              >
                Drill in
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => goToMapAt(p.parentProcessId ?? null, p.id)}
              title="Show on map at this level"
            >
              <MapIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {hasKids && isOpen && children.map((c) => renderNode(c))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Process explorer</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Hierarchy of SIPOCs — expand rows or drill into a parent to map its
          children. Steps can link to deeper processes.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
        <HierarchyBreadcrumbs />
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

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-2 pb-8">
        {searching ? (
          flatSearchResults.length === 0 ? (
            <EmptyState message="No processes match your search." />
          ) : (
            <div className="space-y-1">
              <p className="px-2 py-1 text-xs text-[var(--muted-foreground)]">
                {flatSearchResults.length} match
                {flatSearchResults.length === 1 ? "" : "es"} (flat search)
              </p>
              {flatSearchResults.map((p) => {
                const depth = getProcessDepth(workspace.processes, p.id);
                const kids = getChildCount(workspace.processes, p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--accent)]/40"
                    style={{ paddingLeft: 12 + depth * 12 }}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openEditor(p.id)}
                    >
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        L{depth + 1}
                        {kids > 0 ? ` · ${kids} children` : ""}
                      </div>
                    </button>
                    {kids > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => drillInto(p.id)}>
                        Drill in
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => goToMapAt(p.parentProcessId ?? null, p.id)}
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredTree.length === 0 ? (
          <EmptyState message="No processes yet. Add one from the Map." />
        ) : (
          filteredTree.map((n) => renderNode(n))
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-[var(--muted-foreground)]">
      {message}
    </div>
  );
}
