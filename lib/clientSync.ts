"use client";

import { newId } from "@/lib/ids";
import type { Workspace } from "@/lib/types";
import type {
  ClientToServerMessage,
  GetWorkspaceResponse,
  PutWorkspaceResponse,
  ServerToClientMessage,
  SyncStatus,
} from "@/lib/syncTypes";

const CLIENT_ID_KEY = "sipoc-weaver:client-id";
const SYNC_META_KEY = "sipoc-weaver:sync-meta";
const PUSH_DEBOUNCE_MS = 400;
const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 12_000;

type SyncMeta = {
  workspaceId: string;
  revision: number;
};

export type WorkspaceSyncHandlers = {
  getWorkspace: () => Workspace;
  /** Apply a remote workspace snapshot (already validated). Return false to reject. */
  applyRemote: (workspace: Workspace, revision: number) => boolean;
  onStatus?: (status: SyncStatus, detail?: string) => void;
};

let clientIdMemo: string | null = null;

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  if (clientIdMemo) return clientIdMemo;
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) {
      clientIdMemo = existing;
      return existing;
    }
    const id = newId();
    localStorage.setItem(CLIENT_ID_KEY, id);
    clientIdMemo = id;
    return id;
  } catch {
    clientIdMemo = newId();
    return clientIdMemo;
  }
}

function loadSyncMeta(): SyncMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SyncMeta;
  } catch {
    return null;
  }
}

function saveSyncMeta(meta: SyncMeta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota */
  }
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

export class WorkspaceSync {
  private workspaceId: string;
  private handlers: WorkspaceSyncHandlers;
  private socket: WebSocket | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private applyingRemote = false;
  private pushInFlight = false;
  private pendingPush = false;
  private revision = 0;
  private status: SyncStatus = "idle";

  constructor(workspaceId: string, handlers: WorkspaceSyncHandlers) {
    this.workspaceId = workspaceId;
    this.handlers = handlers;
    const meta = loadSyncMeta();
    if (meta?.workspaceId === workspaceId) {
      this.revision = meta.revision;
    }
  }

  getRevision(): number {
    return this.revision;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  start(): void {
    this.stopped = false;
    void this.bootstrap();
  }

  stop(): void {
    this.stopped = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pushTimer = null;
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.send({
          type: "unsubscribe",
          workspaceId: this.workspaceId,
          clientId: getClientId(),
        });
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.setStatus("idle");
  }

  /** Queue a background push after local edits */
  schedulePush(): void {
    if (this.applyingRemote || this.stopped) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.pushNow();
    }, PUSH_DEBOUNCE_MS);
  }

  /** Immediate push (e.g. before unload) */
  async flush(): Promise<void> {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    await this.pushNow();
  }

  private setStatus(status: SyncStatus, detail?: string) {
    this.status = status;
    this.handlers.onStatus?.(status, detail);
  }

  private async bootstrap() {
    this.setStatus("connecting");
    try {
      const remote = await this.fetchRemote();
      const local = this.handlers.getWorkspace();

      if (remote) {
        const remoteTs = Date.parse(remote.workspace.updatedAt) || 0;
        const localTs = Date.parse(local.updatedAt) || 0;
        const remoteNewer =
          remote.revision > this.revision ||
          (remote.revision >= this.revision && remoteTs > localTs);

        if (remoteNewer) {
          this.applyRemoteDoc(remote.workspace, remote.revision);
        } else if (
          this.revision === 0 ||
          localTs >= remoteTs ||
          JSON.stringify(local.processes) !==
            JSON.stringify(remote.workspace.processes)
        ) {
          // Local ahead or never synced — push
          await this.pushNow();
        } else {
          this.revision = remote.revision;
          saveSyncMeta({ workspaceId: this.workspaceId, revision: this.revision });
          this.setStatus("synced");
        }
      } else {
        // No server copy yet — seed from local
        await this.pushNow();
      }
    } catch (e) {
      console.warn("Sync bootstrap failed; continuing with local + WS", e);
      this.setStatus("offline", e instanceof Error ? e.message : "bootstrap failed");
    }

    this.connectSocket();
  }

  private async fetchRemote(): Promise<GetWorkspaceResponse | null> {
    const res = await fetch(`/api/workspace/${encodeURIComponent(this.workspaceId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GET workspace failed: ${res.status}`);
    }
    return (await res.json()) as GetWorkspaceResponse;
  }

  private async pushNow(): Promise<void> {
    if (this.applyingRemote || this.stopped) return;
    if (this.pushInFlight) {
      this.pendingPush = true;
      return;
    }
    this.pushInFlight = true;
    this.setStatus("syncing");
    try {
      const workspace = this.handlers.getWorkspace();
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(this.workspaceId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace: { ...workspace, id: this.workspaceId },
            clientId: getClientId(),
            baseRevision: this.revision > 0 ? this.revision : undefined,
          }),
        },
      );

      if (res.status === 409) {
        const payload = (await res.json()) as {
          document?: GetWorkspaceResponse;
        };
        if (payload.document?.workspace) {
          this.applyRemoteDoc(
            payload.document.workspace,
            payload.document.revision,
          );
        }
        this.setStatus("synced", "resolved conflict from server");
        return;
      }

      if (!res.ok) {
        throw new Error(`PUT workspace failed: ${res.status}`);
      }

      const data = (await res.json()) as PutWorkspaceResponse;
      this.revision = data.revision;
      saveSyncMeta({ workspaceId: this.workspaceId, revision: this.revision });
      this.setStatus("synced");
    } catch (e) {
      console.warn("Background sync push failed", e);
      this.setStatus(
        "offline",
        e instanceof Error ? e.message : "push failed",
      );
    } finally {
      this.pushInFlight = false;
      if (this.pendingPush) {
        this.pendingPush = false;
        void this.pushNow();
      }
    }
  }

  private applyRemoteDoc(workspace: Workspace, revision: number) {
    this.applyingRemote = true;
    try {
      const accepted = this.handlers.applyRemote(workspace, revision);
      if (accepted) {
        this.revision = revision;
        saveSyncMeta({ workspaceId: this.workspaceId, revision });
        this.setStatus("synced");
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  private connectSocket() {
    if (this.stopped) return;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setStatus("connecting");
    const socket = new WebSocket(wsUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      this.send({
        type: "subscribe",
        workspaceId: this.workspaceId,
        clientId: getClientId(),
      });
    });

    socket.addEventListener("message", (event) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerToClientMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    });

    socket.addEventListener("close", () => {
      this.socket = null;
      if (!this.stopped) {
        this.setStatus("offline", "socket closed");
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      // close handler will reconnect
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSocket();
    }, delay);
  }

  private send(message: ClientToServerMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private handleServerMessage(msg: ServerToClientMessage) {
    if (msg.type === "pong" || msg.type === "error") {
      if (msg.type === "error") {
        console.warn("Sync WS error", msg.message);
      }
      return;
    }

    if (msg.workspaceId !== this.workspaceId) return;

    if (msg.type === "snapshot") {
      if (msg.workspace && msg.revision > this.revision) {
        this.applyRemoteDoc(msg.workspace, msg.revision);
      } else if (msg.revision > 0) {
        this.revision = Math.max(this.revision, msg.revision);
        saveSyncMeta({ workspaceId: this.workspaceId, revision: this.revision });
        this.setStatus("synced");
      }
      return;
    }

    if (msg.type === "workspace:updated") {
      if (msg.clientId === getClientId()) return;
      if (msg.revision <= this.revision) return;
      this.applyRemoteDoc(msg.workspace, msg.revision);
    }
  }
}

let activeSync: WorkspaceSync | null = null;

export function getActiveSync(): WorkspaceSync | null {
  return activeSync;
}

export function startWorkspaceSync(
  workspaceId: string,
  handlers: WorkspaceSyncHandlers,
): WorkspaceSync {
  activeSync?.stop();
  const sync = new WorkspaceSync(workspaceId, handlers);
  activeSync = sync;
  sync.start();
  return sync;
}

export function stopWorkspaceSync(): void {
  activeSync?.stop();
  activeSync = null;
}
