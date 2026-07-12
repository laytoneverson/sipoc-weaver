import { createServer } from "http";
import type { IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { readWorkspaceDocument } from "./lib/server/workspaceRepo";
import { createSyncHub, setSyncHub } from "./lib/server/syncHub";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
} from "./lib/syncTypes";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "localhost";
const dev = process.env.NODE_ENV !== "production";

const server = createServer();
const app = next({ dev, hostname, port, httpServer: server });
const handle = app.getRequestHandler();

function send(socket: WebSocket, message: ServerToClientMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

app.prepare().then(() => {
  const hub = createSyncHub();
  setSyncHub(hub);

  server.on("request", (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const { pathname } = parse(req.url || "", true);
    // Only claim /ws. Leave Next.js HMR (e.g. /_next/webpack-hmr) alone.
    if (pathname !== "/ws") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    hub.addClient(ws);

    ws.on("message", async (data) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientToServerMessage;
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "unsubscribe") {
        hub.unsubscribe(ws);
        return;
      }

      if (msg.type === "subscribe") {
        const { workspaceId, clientId } = msg;
        if (!workspaceId || !clientId) {
          send(ws, {
            type: "error",
            message: "workspaceId and clientId required",
          });
          return;
        }
        hub.subscribe(ws, workspaceId, clientId);
        try {
          const doc = await readWorkspaceDocument(workspaceId);
          send(ws, {
            type: "snapshot",
            workspaceId,
            revision: doc?.revision ?? 0,
            workspace: doc?.workspace ?? null,
          });
        } catch (e) {
          console.error("Failed to load snapshot", e);
          send(ws, { type: "error", message: "Failed to load workspace" });
        }
      }
    });

    ws.on("close", () => {
      hub.removeClient(ws);
    });

    ws.on("error", () => {
      hub.removeClient(ws);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (WebSocket /ws)`);
  });
});
