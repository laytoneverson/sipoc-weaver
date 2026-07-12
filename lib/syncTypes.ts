import type { Workspace } from "./types";

/** Stable id so browsers share one collaborative workspace by default */
export const DEFAULT_WORKSPACE_ID = "default";

export type SyncStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "syncing"
  | "synced"
  | "offline"
  | "error";

export interface WorkspaceDocument {
  revision: number;
  updatedAt: string;
  workspace: Workspace;
}

export type ClientToServerMessage =
  | { type: "subscribe"; workspaceId: string; clientId: string }
  | { type: "unsubscribe"; workspaceId: string; clientId: string }
  | { type: "ping" };

export type ServerToClientMessage =
  | {
      type: "snapshot";
      workspaceId: string;
      revision: number;
      workspace: Workspace | null;
    }
  | {
      type: "workspace:updated";
      workspaceId: string;
      revision: number;
      workspace: Workspace;
      clientId: string;
      updatedAt: string;
    }
  | { type: "pong" }
  | { type: "error"; message: string };

export interface PutWorkspaceBody {
  workspace: Workspace;
  clientId: string;
  /** Optional optimistic concurrency check */
  baseRevision?: number;
}

export interface PutWorkspaceResponse {
  revision: number;
  updatedAt: string;
  workspace: Workspace;
}

export interface GetWorkspaceResponse {
  revision: number;
  updatedAt: string;
  workspace: Workspace;
}
