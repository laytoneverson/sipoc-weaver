import type { Connection, Process, Workspace } from "@/lib/types";
import type {
  Organization,
  OuRole,
  SessionUser,
  UserOuMembership,
} from "@/lib/orgTypes";

const ROLE_RANK: Record<OuRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

export function getUserMemberships(
  org: Organization,
  userId: string,
): UserOuMembership[] {
  return org.memberships.filter((m) => m.userId === userId);
}

export function getRoleForOu(
  org: Organization,
  userId: string,
  ouId: string | undefined,
): OuRole | null {
  if (!ouId) return null;
  const membership = org.memberships.find(
    (m) => m.userId === userId && m.ouId === ouId,
  );
  return membership?.role ?? null;
}

export function hasMinRole(
  role: OuRole | null,
  minimum: OuRole,
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function accessibleOuIds(
  org: Organization,
  userId: string,
): string[] {
  return getUserMemberships(org, userId).map((m) => m.ouId);
}

function processMap(processes: Process[]): Map<string, Process> {
  return new Map(processes.map((p) => [p.id, p]));
}

/** Processes visible to the user: in accessible OUs plus cross-OU link partners. */
export function visibleProcessIds(
  workspace: Workspace,
  org: Organization,
  userId: string,
): Set<string> {
  const allowedOus = new Set(accessibleOuIds(org, userId));
  const byId = processMap(workspace.processes);
  const visible = new Set<string>();

  for (const p of workspace.processes) {
    if (p.ouId && allowedOus.has(p.ouId)) {
      visible.add(p.id);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of workspace.connections) {
      const from = byId.get(c.fromProcessId);
      const to = byId.get(c.toProcessId);
      if (!from || !to) continue;
      const fromVisible = visible.has(from.id);
      const toVisible = visible.has(to.id);
      if (fromVisible && !toVisible) {
        visible.add(to.id);
        changed = true;
      }
      if (toVisible && !fromVisible) {
        visible.add(from.id);
        changed = true;
      }
    }
  }

  return visible;
}

export function filterWorkspaceForUser(
  workspace: Workspace,
  org: Organization,
  userId: string,
): Workspace {
  const visible = visibleProcessIds(workspace, org, userId);
  const processes = workspace.processes.filter((p) => visible.has(p.id));
  const connections = workspace.connections.filter(
    (c) => visible.has(c.fromProcessId) && visible.has(c.toProcessId),
  );
  return { ...workspace, processes, connections };
}

export function canViewProcess(
  process: Process,
  org: Organization,
  userId: string,
  workspace: Workspace,
): boolean {
  return visibleProcessIds(workspace, org, userId).has(process.id);
}

export function canEditProcess(
  process: Process,
  org: Organization,
  userId: string,
): boolean {
  if (!process.ouId) return false;
  const role = getRoleForOu(org, userId, process.ouId);
  return hasMinRole(role, "editor");
}

export function canCreateConnection(
  from: Process,
  to: Process,
  org: Organization,
  userId: string,
): boolean {
  return canEditProcess(from, org, userId) || canEditProcess(to, org, userId);
}

export function validateWorkspaceWrite(
  workspace: Workspace,
  org: Organization,
  user: SessionUser,
): { ok: true } | { ok: false; error: string } {
  for (const p of workspace.processes) {
    if (!p.ouId) {
      return {
        ok: false,
        error: `Process "${p.name}" must belong to an organizational unit`,
      };
    }
    if (!canEditProcess(p, org, user.id)) {
      return {
        ok: false,
        error: `No edit access to process "${p.name}" in its organizational unit`,
      };
    }
  }

  const byId = processMap(workspace.processes);
  for (const c of workspace.connections) {
    const from = byId.get(c.fromProcessId);
    const to = byId.get(c.toProcessId);
    if (!from || !to) continue;
    if (!canCreateConnection(from, to, org, user.id)) {
      return {
        ok: false,
        error: "No permission to create or modify a cross-OU connection",
      };
    }
  }

  return { ok: true };
}

export function isCrossOuConnection(
  from: Process | undefined,
  to: Process | undefined,
): boolean {
  if (!from?.ouId || !to?.ouId) return false;
  return from.ouId !== to.ouId;
}

export function annotateConnectionCrossOu(
  connection: Connection,
  processes: Process[],
): Connection {
  const byId = processMap(processes);
  const from = byId.get(connection.fromProcessId);
  const to = byId.get(connection.toProcessId);
  const crossOu = isCrossOuConnection(from, to);
  if (connection.crossOu === crossOu) return connection;
  return { ...connection, crossOu };
}

export function annotateWorkspaceConnections(
  workspace: Workspace,
): Workspace {
  const connections = workspace.connections.map((c) =>
    annotateConnectionCrossOu(c, workspace.processes),
  );
  return { ...workspace, connections };
}
