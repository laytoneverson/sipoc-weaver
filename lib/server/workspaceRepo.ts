import type { Workspace } from "@/lib/types";
import { workspaceSchema } from "@/lib/types";
import { migrateWorkspaceHierarchy } from "@/lib/hierarchy";
import { migrateWorkspaceSecurity } from "@/lib/securityMigration";
import type { WorkspaceDocument } from "@/lib/syncTypes";
import { prisma } from "@/lib/server/db";
import type { Prisma } from "@prisma/client";

function migrateWorkspace(ws: Workspace): Workspace {
  return migrateWorkspaceSecurity(migrateWorkspaceHierarchy(ws));
}

function safeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned.length > 128) {
    throw new Error("Invalid workspace id");
  }
  return cleaned;
}

function normalizeWorkspace(raw: unknown, id: string): Workspace {
  const obj = raw as Workspace;
  const migrated = migrateWorkspace({ ...obj, id: safeId(id) });
  const parsed = workspaceSchema.safeParse(migrated);
  return (parsed.success ? parsed.data : migrated) as Workspace;
}

export async function readWorkspaceDocument(
  id: string,
): Promise<WorkspaceDocument | null> {
  const wid = safeId(id);
  const row = await prisma.workspaceRecord.findUnique({ where: { id: wid } });
  if (!row) return null;

  const workspace = normalizeWorkspace(row.workspace, wid);
  return {
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    workspace,
  };
}

export async function writeWorkspaceDocument(
  id: string,
  workspace: Workspace,
  previousRevision?: number,
): Promise<WorkspaceDocument> {
  const wid = safeId(id);
  const existing = await prisma.workspaceRecord.findUnique({ where: { id: wid } });

  if (
    previousRevision !== undefined &&
    existing &&
    existing.revision !== previousRevision
  ) {
    const conflict = new Error("Revision conflict") as Error & {
      status: number;
      document: WorkspaceDocument;
    };
    conflict.status = 409;
    conflict.document = {
      revision: existing.revision,
      updatedAt: existing.updatedAt.toISOString(),
      workspace: normalizeWorkspace(existing.workspace, wid),
    };
    throw conflict;
  }

  const nextRevision = (existing?.revision ?? 0) + 1;
  const updatedAt = new Date();
  const migrated = migrateWorkspace({ ...workspace, id: wid });
  const workspacePayload = { ...migrated, updatedAt: updatedAt.toISOString() };
  const workspaceJson = workspacePayload as unknown as Prisma.InputJsonValue;

  const row = await prisma.workspaceRecord.upsert({
    where: { id: wid },
    create: {
      id: wid,
      revision: nextRevision,
      updatedAt,
      workspace: workspaceJson,
    },
    update: {
      revision: nextRevision,
      updatedAt,
      workspace: workspaceJson,
    },
  });

  return {
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    workspace: normalizeWorkspace(row.workspace, wid),
  };
}

export async function listWorkspaceIds(): Promise<string[]> {
  const rows = await prisma.workspaceRecord.findMany({
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => r.id);
}
