import type { WebSocket } from "ws";
import type { ServerToClientMessage } from "@/lib/syncTypes";

type ClientMeta = {
  clientId: string;
  workspaceId: string | null;
};

export type SyncHub = {
  addClient: (socket: WebSocket) => void;
  removeClient: (socket: WebSocket) => void;
  subscribe: (
    socket: WebSocket,
    workspaceId: string,
    clientId: string,
  ) => void;
  unsubscribe: (socket: WebSocket) => void;
  broadcast: (
    workspaceId: string,
    message: ServerToClientMessage,
    excludeClientId?: string,
  ) => void;
  getSubscriberCount: (workspaceId: string) => number;
};

type GlobalWithHub = typeof globalThis & {
  __sipocSyncHub?: SyncHub;
  __sipocSocketMeta?: WeakMap<WebSocket, ClientMeta>;
};

function getMetaMap(): WeakMap<WebSocket, ClientMeta> {
  const g = globalThis as GlobalWithHub;
  if (!g.__sipocSocketMeta) {
    g.__sipocSocketMeta = new WeakMap();
  }
  return g.__sipocSocketMeta;
}

export function createSyncHub(): SyncHub {
  const rooms = new Map<string, Set<WebSocket>>();
  const metaMap = getMetaMap();

  const leaveRoom = (socket: WebSocket) => {
    const meta = metaMap.get(socket);
    if (!meta?.workspaceId) return;
    const set = rooms.get(meta.workspaceId);
    set?.delete(socket);
    if (set && set.size === 0) rooms.delete(meta.workspaceId);
    meta.workspaceId = null;
  };

  const hub: SyncHub = {
    addClient(socket) {
      metaMap.set(socket, { clientId: "", workspaceId: null });
    },

    removeClient(socket) {
      leaveRoom(socket);
      metaMap.delete(socket);
    },

    subscribe(socket, workspaceId, clientId) {
      leaveRoom(socket);
      let set = rooms.get(workspaceId);
      if (!set) {
        set = new Set();
        rooms.set(workspaceId, set);
      }
      set.add(socket);
      metaMap.set(socket, { clientId, workspaceId });
    },

    unsubscribe(socket) {
      leaveRoom(socket);
    },

    broadcast(workspaceId, message, excludeClientId) {
      const set = rooms.get(workspaceId);
      if (!set) return;
      const payload = JSON.stringify(message);
      for (const socket of set) {
        const meta = metaMap.get(socket);
        if (excludeClientId && meta?.clientId === excludeClientId) continue;
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(payload);
        }
      }
    },

    getSubscriberCount(workspaceId) {
      return rooms.get(workspaceId)?.size ?? 0;
    },
  };

  return hub;
}

export function getSyncHub(): SyncHub {
  const g = globalThis as GlobalWithHub;
  if (!g.__sipocSyncHub) {
    g.__sipocSyncHub = createSyncHub();
  }
  return g.__sipocSyncHub;
}

export function setSyncHub(hub: SyncHub): void {
  (globalThis as GlobalWithHub).__sipocSyncHub = hub;
}
