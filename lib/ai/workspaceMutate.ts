import {
  readWorkspaceDocument,
  writeWorkspaceDocument,
} from "@/lib/server/workspaceRepo";
import { getSyncHub } from "@/lib/server/syncHub";
import { createEmptyWorkspace } from "@/lib/sampleData";
import { analyzeWorkspace, issuesForProcess } from "@/lib/holeDetection";
import { DEFAULT_WORKSPACE_ID } from "@/lib/syncTypes";
import { nowIso } from "@/lib/ids";
import { prepareWorkspace } from "@/lib/workspaceOps";
import type {
  AnalysisResult,
  Issue,
  IssueSeverity,
  Process,
  Workspace,
} from "@/lib/types";
import type { WorkspaceDocument } from "@/lib/syncTypes";

export const CHAT_CLIENT_ID = "chat";

export function getWorkspaceId(): string {
  return process.env.SIPOC_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;
}

/** Load workspace document; create empty if missing. */
export async function loadDocument(): Promise<WorkspaceDocument> {
  const id = getWorkspaceId();
  const existing = await readWorkspaceDocument(id);
  if (existing) return existing;

  const workspace = createEmptyWorkspace();
  workspace.id = id;
  return writeWorkspaceDocument(id, workspace);
}

export async function loadWorkspace(): Promise<Workspace> {
  const doc = await loadDocument();
  return doc.workspace;
}

/**
 * Apply a pure mutation, persist, and broadcast to connected browsers via syncHub.
 */
export async function mutateWorkspace<T = undefined>(
  fn: (workspace: Workspace) => { workspace: Workspace; result?: T },
): Promise<{
  document: WorkspaceDocument;
  analysis: AnalysisResult;
  result: T | undefined;
}> {
  const id = getWorkspaceId();
  const current = await loadDocument();
  const { workspace: mutated, result } = fn(current.workspace);
  const next = prepareWorkspace(mutated);
  const withAnalysisStamp: Workspace = {
    ...next,
    id,
    lastAnalyzedAt: nowIso(),
  };

  const document = await writeWorkspaceDocument(
    id,
    withAnalysisStamp,
    current.revision,
  );

  try {
    getSyncHub().broadcast(id, {
      type: "workspace:updated",
      workspaceId: id,
      revision: document.revision,
      workspace: document.workspace,
      clientId: CHAT_CLIENT_ID,
      updatedAt: document.updatedAt,
    });
  } catch {
    // Hub may be uninitialized outside the custom server; file write still succeeded.
  }

  const analysis = analyzeWorkspace(document.workspace);
  return { document, analysis, result };
}

export async function analyze(): Promise<{
  workspace: Workspace;
  analysis: AnalysisResult;
}> {
  const raw = await loadWorkspace();
  const workspace = prepareWorkspace(raw);
  const analysis = analyzeWorkspace(workspace);
  return { workspace, analysis };
}

export function getProcess(
  workspace: Workspace,
  processId: string,
): Process | undefined {
  return workspace.processes.find((p) => p.id === processId);
}

export function processIssues(
  workspace: Workspace,
  processId: string,
): Issue[] {
  return issuesForProcess(workspace, processId);
}

export function filterAnalysis(
  analysis: AnalysisResult,
  opts?: { severity?: IssueSeverity; processId?: string },
): AnalysisResult {
  let issues = analysis.issues;
  if (opts?.severity) {
    issues = issues.filter((i) => i.severity === opts.severity);
  }
  if (opts?.processId) {
    issues = issues.filter((i) => i.processId === opts.processId);
  }
  return { ...analysis, issues };
}

export function workspaceSummary(
  workspace: Workspace,
  analysis: AnalysisResult,
) {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description ?? "",
    processCount: workspace.processes.length,
    connectionCount: workspace.connections.length,
    avgCompleteness: analysis.stats.avgCompleteness,
    holeCount: analysis.stats.holeCount,
    connectivityScore: analysis.stats.connectivityScore,
    lastAnalyzedAt: workspace.lastAnalyzedAt ?? null,
  };
}

export function listProcessSummaries(workspace: Workspace) {
  return workspace.processes.map((p) => ({
    id: p.id,
    name: p.name,
    parentProcessId: p.parentProcessId ?? null,
    stepCount: p.steps.length,
    supplierCount: p.suppliers.length,
    inputCount: p.inputs.length,
    outputCount: p.outputs.length,
    customerCount: p.customers.length,
    completenessScore: p.completenessScore ?? null,
    tags: p.tags,
  }));
}
