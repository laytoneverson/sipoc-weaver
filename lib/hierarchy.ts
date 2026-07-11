import { newId } from "./ids";
import type { ID, Process, ProcessStep, Workspace } from "./types";

/** Normalize legacy string steps or partial objects into ProcessStep[] */
export function normalizeSteps(
  steps: Array<
    | string
    | ProcessStep
    | {
        id?: string;
        text?: string;
        name?: string;
        subprocessId?: string;
      }
  >,
): ProcessStep[] {
  return steps.map((s) => {
    if (typeof s === "string") {
      return { id: newId(), text: s };
    }
    const text =
      "text" in s && typeof s.text === "string"
        ? s.text
        : "name" in s && typeof (s as { name?: string }).name === "string"
          ? (s as { name: string }).name
          : "";
    return {
      id: s.id ?? newId(),
      text,
      subprocessId: s.subprocessId,
    };
  });
}

export function stepTexts(process: Process): string[] {
  return process.steps.map((s) => s.text);
}

export function filledStepCount(process: Process): number {
  return process.steps.filter((s) => s.text.trim()).length;
}

export function getChildren(
  processes: Process[],
  parentId: ID | null,
): Process[] {
  return processes.filter((p) =>
    parentId === null
      ? !p.parentProcessId
      : p.parentProcessId === parentId,
  );
}

export function getChildCount(processes: Process[], processId: ID): number {
  return processes.filter((p) => p.parentProcessId === processId).length;
}

/** Ancestors from root → immediate parent (excludes self) */
export function getAncestorChain(
  processes: Process[],
  processId: ID,
): Process[] {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const chain: Process[] = [];
  let current = byId.get(processId);
  const seen = new Set<ID>();
  while (current?.parentProcessId) {
    if (seen.has(current.parentProcessId)) break;
    seen.add(current.parentProcessId);
    const parent = byId.get(current.parentProcessId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export type BreadcrumbItem = { id: ID | null; name: string };

/** Breadcrumbs for the current map/explorer focus (null = workspace root) */
export function getFocusBreadcrumbs(
  processes: Process[],
  focusParentId: ID | null,
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ id: null, name: "Workspace" }];
  if (!focusParentId) return crumbs;
  const focus = processes.find((p) => p.id === focusParentId);
  if (!focus) return crumbs;
  for (const a of getAncestorChain(processes, focusParentId)) {
    crumbs.push({ id: a.id, name: a.name });
  }
  crumbs.push({ id: focus.id, name: focus.name });
  return crumbs;
}

/** Processes visible on the map at a given hierarchy focus */
export function getScopedProcesses(
  processes: Process[],
  focusParentId: ID | null,
): Process[] {
  return getChildren(processes, focusParentId);
}

export function getDescendantIds(
  processes: Process[],
  rootId: ID,
): Set<ID> {
  const result = new Set<ID>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of processes) {
      if (child.parentProcessId === id && !result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export interface ProcessTreeNode {
  process: Process;
  children: ProcessTreeNode[];
  depth: number;
}

export function buildProcessTree(processes: Process[]): ProcessTreeNode[] {
  const byParent = new Map<string | null, Process[]>();
  for (const p of processes) {
    const key = p.parentProcessId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  const sortFn = (a: Process, b: Process) => a.name.localeCompare(b.name);

  function build(parentId: string | null, depth: number): ProcessTreeNode[] {
    const kids = [...(byParent.get(parentId) ?? [])].sort(sortFn);
    return kids.map((process) => ({
      process,
      depth,
      children: build(process.id, depth + 1),
    }));
  }

  return build(null, 0);
}

/** Depth of a process (0 = top-level) */
export function getProcessDepth(processes: Process[], processId: ID): number {
  return getAncestorChain(processes, processId).length;
}

/** Would setting parent create a cycle? */
export function wouldCreateHierarchyCycle(
  processes: Process[],
  processId: ID,
  newParentId: ID | undefined,
): boolean {
  if (!newParentId) return false;
  if (newParentId === processId) return true;
  const descendants = getDescendantIds(processes, processId);
  return descendants.has(newParentId);
}

/** Find which parent step (if any) links to this process as subprocess */
export function findIncomingStepLink(
  processes: Process[],
  processId: ID,
): { parent: Process; step: ProcessStep } | null {
  for (const p of processes) {
    for (const step of p.steps) {
      if (step.subprocessId === processId) {
        return { parent: p, step };
      }
    }
  }
  return null;
}

export function migrateProcessSteps(raw: unknown): Process {
  const p = raw as Process & { steps: unknown[] };
  return {
    ...p,
    parentProcessId: p.parentProcessId,
    steps: normalizeSteps(
      (p.steps ?? []) as Array<string | ProcessStep>,
    ),
  };
}

export function migrateWorkspaceHierarchy(ws: Workspace): Workspace {
  return {
    ...ws,
    processes: ws.processes.map((p) => migrateProcessSteps(p)),
  };
}
