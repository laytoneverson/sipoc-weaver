import type { Workspace } from "./types";
import { SCHEMA_VERSION, workspaceSchema } from "./types";

const STORAGE_KEY = "sipoc-weaver:workspace";

export function saveWorkspace(workspace: Workspace): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch (e) {
    console.error("Failed to save workspace", e);
  }
}

export function loadWorkspace(): Workspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Workspace;
    const result = workspaceSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Stored workspace failed validation", result.error);
      return parsed as Workspace; // best-effort for older drafts
    }
    return migrateWorkspace(result.data);
  } catch (e) {
    console.error("Failed to load workspace", e);
    return null;
  }
}

export function clearWorkspaceStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function migrateWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    schemaVersion: ws.schemaVersion ?? SCHEMA_VERSION,
  };
}

export function exportWorkspaceJson(workspace: Workspace): string {
  return JSON.stringify(
    { ...workspace, schemaVersion: SCHEMA_VERSION },
    null,
    2,
  );
}

export function downloadWorkspace(workspace: Workspace, filename?: string): void {
  const blob = new Blob([exportWorkspaceJson(workspace)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `${workspace.name.replace(/\s+/g, "-").toLowerCase()}.sipoc.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseWorkspaceFile(file: File): Promise<Workspace> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const result = workspaceSchema.safeParse(parsed);
  if (!result.success) {
    // Allow slightly loose imports
    if (parsed && Array.isArray(parsed.processes)) {
      return migrateWorkspace(parsed as Workspace);
    }
    throw new Error("Invalid SIPOC workspace file");
  }
  return migrateWorkspace(result.data);
}
