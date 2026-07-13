import { OWNER_TO_OU } from "@/lib/ouIds";
import { migrateWorkspaceHierarchy } from "@/lib/hierarchy";
import type { Connection, Process, Workspace } from "@/lib/types";
import { SCHEMA_VERSION } from "@/lib/types";

function migrateProcess(p: Process): Process {
  const ouId = p.ouId ?? OWNER_TO_OU[p.owner ?? ""];
  return ouId && ouId !== p.ouId ? { ...p, ouId } : p;
}

function annotateConnection(
  c: Connection,
  processes: Process[],
): Connection {
  const from = processes.find((p) => p.id === c.fromProcessId);
  const to = processes.find((p) => p.id === c.toProcessId);
  const crossOu =
    !!from?.ouId && !!to?.ouId && from.ouId !== to.ouId;
  return c.crossOu === crossOu ? c : { ...c, crossOu };
}

/** Apply security-related migrations (OU assignment, cross-OU flags). */
export function migrateWorkspaceSecurity(ws: Workspace): Workspace {
  const withHierarchy = migrateWorkspaceHierarchy(ws);
  const processes = withHierarchy.processes.map(migrateProcess);
  const connections = withHierarchy.connections.map((c) =>
    annotateConnection(c, processes),
  );
  return {
    ...withHierarchy,
    processes,
    connections,
    schemaVersion: SCHEMA_VERSION,
  };
}
