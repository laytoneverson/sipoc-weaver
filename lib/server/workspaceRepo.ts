import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { Workspace } from "@/lib/types";
import { SCHEMA_VERSION, workspaceSchema } from "@/lib/types";
import { migrateWorkspaceHierarchy } from "@/lib/hierarchy";
import type { WorkspaceDocument } from "@/lib/syncTypes";

const DATA_DIR =
  process.env.SIPOC_DATA_DIR ?? path.join(process.cwd(), "data", "workspaces");

function migrateWorkspace(ws: Workspace): Workspace {
  return {
    ...migrateWorkspaceHierarchy(ws),
    schemaVersion: SCHEMA_VERSION,
  };
}

function safeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned.length > 128) {
    throw new Error("Invalid workspace id");
  }
  return cleaned;
}

function filePath(id: string): string {
  return path.join(DATA_DIR, `${safeId(id)}.json`);
}

async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

function normalizeDocument(raw: unknown): WorkspaceDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Envelope form: { revision, updatedAt, workspace }
  if (obj.workspace && typeof obj.workspace === "object") {
    const migrated = migrateWorkspace(obj.workspace as Workspace);
    const parsed = workspaceSchema.safeParse(migrated);
    const workspace = (parsed.success ? parsed.data : migrated) as Workspace;
    return {
      revision: typeof obj.revision === "number" ? obj.revision : 1,
      updatedAt:
        typeof obj.updatedAt === "string"
          ? obj.updatedAt
          : workspace.updatedAt,
      workspace,
    };
  }

  // Legacy: bare workspace JSON
  if (Array.isArray(obj.processes)) {
    const migrated = migrateWorkspace(obj as unknown as Workspace);
    const parsed = workspaceSchema.safeParse(migrated);
    const workspace = (parsed.success ? parsed.data : migrated) as Workspace;
    return {
      revision: 1,
      updatedAt: workspace.updatedAt,
      workspace,
    };
  }

  return null;
}

export async function readWorkspaceDocument(
  id: string,
): Promise<WorkspaceDocument | null> {
  await ensureDir();
  try {
    const raw = await readFile(filePath(id), "utf8");
    return normalizeDocument(JSON.parse(raw));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeWorkspaceDocument(
  id: string,
  workspace: Workspace,
  previousRevision?: number,
): Promise<WorkspaceDocument> {
  await ensureDir();
  const existing = await readWorkspaceDocument(id);
  const nextRevision = (existing?.revision ?? 0) + 1;

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
    conflict.document = existing;
    throw conflict;
  }

  const migrated = migrateWorkspace({ ...workspace, id: safeId(id) });
  const updatedAt = new Date().toISOString();
  const document: WorkspaceDocument = {
    revision: nextRevision,
    updatedAt,
    workspace: { ...migrated, updatedAt },
  };

  const target = filePath(id);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(document, null, 2), "utf8");
  await rename(tmp, target);
  return document;
}
