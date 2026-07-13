import {
  readWorkspaceDocument,
  writeWorkspaceDocument,
} from "@/lib/server/workspaceRepo";
import { createEmptyWorkspace } from "@/lib/sampleData";
import { analyzeWorkspace, issuesForProcess } from "@/lib/holeDetection";
import { DEFAULT_WORKSPACE_ID, type PutWorkspaceBody } from "@/lib/syncTypes";
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

const MCP_CLIENT_ID = "mcp";

export function getWorkspaceId(): string {
  return process.env.SIPOC_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;
}

export function getWeaverUrl(): string {
  return (
    process.env.SIPOC_WEAVER_URL?.replace(/\/$/, "") || "http://localhost:3000"
  );
}

function log(...args: unknown[]) {
  console.error("[sipoc-mcp]", ...args);
}

/** Load workspace document; create empty if missing. */
export async function loadDocument(): Promise<WorkspaceDocument> {
  const id = getWorkspaceId();
  const existing = await readWorkspaceDocument(id);
  if (existing) return existing;

  const workspace = createEmptyWorkspace();
  workspace.id = id;
  const written = await writeWorkspaceDocument(id, workspace);
  log(`created empty workspace ${id}`);
  return written;
}

export async function loadWorkspace(): Promise<Workspace> {
  const doc = await loadDocument();
  return doc.workspace;
}

async function tryPutApi(
  workspace: Workspace,
  baseRevision: number,
): Promise<WorkspaceDocument | null> {
  const id = getWorkspaceId();
  const url = `${getWeaverUrl()}/api/workspace/${id}`;
  const body: PutWorkspaceBody = {
    workspace: { ...workspace, id },
    clientId: MCP_CLIENT_ID,
    baseRevision,
  };

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log(`API PUT ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as {
      revision: number;
      updatedAt: string;
      workspace: Workspace;
    };
    return {
      revision: json.revision,
      updatedAt: json.updatedAt,
      workspace: json.workspace,
    };
  } catch (err) {
    log(`API unreachable (${getWeaverUrl()}), writing to disk only`);
    void err;
    return null;
  }
}

/**
 * Apply a pure mutation, persist, and best-effort broadcast to the running app.
 * Optional `fn` return value is passed through as `result`.
 */
export async function mutateWorkspace<T = undefined>(
  fn: (workspace: Workspace) => { workspace: Workspace; result?: T },
): Promise<{
  document: WorkspaceDocument;
  analysis: AnalysisResult;
  result: T | undefined;
}> {
  const current = await loadDocument();
  const { workspace: mutated, result } = fn(current.workspace);
  const next = prepareWorkspace(mutated);
  const withAnalysisStamp: Workspace = {
    ...next,
    lastAnalyzedAt: nowIso(),
  };

  let document = await tryPutApi(withAnalysisStamp, current.revision);
  if (!document) {
    document = await writeWorkspaceDocument(
      getWorkspaceId(),
      withAnalysisStamp,
      current.revision,
    );
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

export function workspaceSummary(workspace: Workspace, analysis: AnalysisResult) {
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

export function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
