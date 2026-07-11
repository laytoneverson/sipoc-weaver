"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  GitBranch,
  Link2,
  RefreshCw,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { IssueSeverity, IssueType } from "@/lib/types";

const typeLabels: Record<IssueType, string> = {
  missing_source: "Missing source",
  missing_destination: "Orphaned output",
  incomplete_sipoc: "Incomplete SIPOC",
  isolated_process: "Isolated process",
  step_count: "Step count",
  suggestion_link: "Link suggestion",
  missing_section: "Missing section",
};

export function GapsView() {
  const analysis = useWorkspaceStore((s) => s.analysis);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const reanalyze = useWorkspaceStore((s) => s.reanalyze);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const openEditor = useWorkspaceStore((s) => s.openEditor);
  const setView = useWorkspaceStore((s) => s.setView);

  const [severity, setSeverity] = useState<"all" | IssueSeverity>("all");
  const [type, setType] = useState<"all" | IssueType>("all");

  const issues = useMemo(() => {
    let list = analysis?.issues ?? [];
    if (severity !== "all") list = list.filter((i) => i.severity === severity);
    if (type !== "all") list = list.filter((i) => i.type === type);
    const order = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [analysis, severity, type]);

  const stats = analysis?.stats;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gaps & insights</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Hole detection across {workspace.name}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => reanalyze()}>
          <RefreshCw className="h-4 w-4" />
          Re-analyze
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<GitBranch className="h-4 w-4" />}
          label="Processes"
          value={String(stats?.totalProcesses ?? 0)}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Avg completeness"
          value={`${stats?.avgCompleteness ?? 0}%`}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Critical holes"
          value={String(stats?.holeCount ?? 0)}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Connectivity"
          value={`${stats?.connectivityScore ?? 0}%`}
          hint={`${stats?.linkedInputsPct ?? 0}% inputs sourced · ${stats?.consumedOutputsPct ?? 0}% outputs consumed`}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          className="w-40"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as typeof severity)}
        >
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select
          className="w-48"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="all">All types</option>
          {(Object.keys(typeLabels) as IssueType[]).map((t) => (
            <option key={t} value={t}>
              {typeLabels[t]}
            </option>
          ))}
        </Select>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-16 text-sm text-[var(--muted-foreground)]">
          No issues match — nice work.
        </div>
      ) : (
        <div className="space-y-2 pb-8">
          {issues.map((issue) => {
            const process = workspace.processes.find(
              (p) => p.id === issue.processId,
            );
            return (
              <Card key={issue.id} className="transition hover:border-[var(--ring)]">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          issue.severity === "high"
                            ? "danger"
                            : issue.severity === "medium"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {issue.severity}
                      </Badge>
                      <Badge variant="outline">
                        {typeLabels[issue.type]}
                      </Badge>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {process?.name ?? "Unknown process"}
                      </span>
                    </div>
                    <p className="text-sm">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
                        <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
                        {issue.suggestion}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        selectProcess(issue.processId);
                        setView("map");
                      }}
                    >
                      Jump to map
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openEditor(issue.processId)}
                    >
                      Fix
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && (
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
