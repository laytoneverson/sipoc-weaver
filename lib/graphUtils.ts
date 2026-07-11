import type { Connection, ID, Process, Workspace } from "./types";

export interface Degree {
  in: number;
  out: number;
}

export function buildAdjacency(connections: Connection[]): {
  out: Map<ID, ID[]>;
  in: Map<ID, ID[]>;
} {
  const out = new Map<ID, ID[]>();
  const inn = new Map<ID, ID[]>();

  for (const c of connections) {
    const outs = out.get(c.fromProcessId) ?? [];
    outs.push(c.toProcessId);
    out.set(c.fromProcessId, outs);

    const ins = inn.get(c.toProcessId) ?? [];
    ins.push(c.fromProcessId);
    inn.set(c.toProcessId, ins);
  }

  return { out, in: inn };
}

export function getNodeDegree(
  processId: ID,
  connections: Connection[],
): Degree {
  let inn = 0;
  let out = 0;
  for (const c of connections) {
    if (c.toProcessId === processId) inn++;
    if (c.fromProcessId === processId) out++;
  }
  return { in: inn, out };
}

/** BFS upstream (incoming edges) from a process */
export function getUpstreamIds(
  processId: ID,
  connections: Connection[],
): Set<ID> {
  const { in: inn } = buildAdjacency(connections);
  const visited = new Set<ID>();
  const queue = [...(inn.get(processId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const prev of inn.get(id) ?? []) {
      if (!visited.has(prev)) queue.push(prev);
    }
  }
  return visited;
}

/** BFS downstream (outgoing edges) from a process */
export function getDownstreamIds(
  processId: ID,
  connections: Connection[],
): Set<ID> {
  const { out } = buildAdjacency(connections);
  const visited = new Set<ID>();
  const queue = [...(out.get(processId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of out.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return visited;
}

/** Detect simple cycles via DFS; returns list of process IDs involved in cycles */
export function findCycleProcessIds(connections: Connection[]): Set<ID> {
  const { out } = buildAdjacency(connections);
  const visited = new Set<ID>();
  const stack = new Set<ID>();
  const inCycle = new Set<ID>();

  function dfs(id: ID) {
    visited.add(id);
    stack.add(id);
    for (const next of out.get(id) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        inCycle.add(id);
        inCycle.add(next);
      }
    }
    stack.delete(id);
  }

  for (const id of out.keys()) {
    if (!visited.has(id)) dfs(id);
  }
  return inCycle;
}

export function connectionLabel(
  workspace: Workspace,
  connection: Connection,
): string {
  const from = workspace.processes.find((p) => p.id === connection.fromProcessId);
  const out = from?.outputs.find((o) => o.id === connection.fromOutputId);
  return out?.name ?? "flow";
}

export function findProcess(workspace: Workspace, id: ID): Process | undefined {
  return workspace.processes.find((p) => p.id === id);
}

/** Normalize similarity for name matching (0–1) */
export function nameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const ta = new Set(na.split(/[\s_\-/]+/).filter(Boolean));
  const tb = new Set(nb.split(/[\s_\-/]+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
