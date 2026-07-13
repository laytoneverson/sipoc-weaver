# SIPOC Weaver

Interactive process-mapping web app for defining SIPOC processes, linking Inputs ↔ Outputs across processes, exploring the ecosystem on a canvas, and automatically detecting gaps (“holes”).

## Quick start

**Requires PostgreSQL.** Use Docker Compose or a local Postgres instance.

```bash
cp .env.example .env
docker compose up -d          # or point DATABASE_URL at your Postgres
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with `admin@example.com` / `admin123` (see login screen for other demo accounts). On first load, a **Healthcare Benefits TPA** sample workspace is created with intentional holes for the Gaps view.

## Tech stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS v4** + custom shadcn-style primitives
- **@xyflow/react** (React Flow) + **@dagrejs/dagre** auto-layout
- **Zustand** for workspace state + undo/redo
- **Zod** for workspace import validation
- **Fuse.js** fuzzy search in Library
- **PostgreSQL** + **Prisma** for users, org units, memberships, and workspace documents
- **localStorage** optimistic client cache + background server sync
- **WebSocket** realtime fan-out for multi-user edits
- **next-themes** dark/light mode (dark-first)
- **sonner** toasts, **lucide-react** icons

## Features (MVP)

| Area | Capabilities |
|------|----------------|
| **Map** | Health-colored nodes, I/O linking, auto-layout, **hierarchy drill-down + breadcrumbs** |
| **Editor** | Full SIPOC editing, **parent process + step→subprocess**, live issues |
| **Explorer** | Hierarchical tree, fuzzy search, drill-in / show on map |
| **Gaps** | Completeness & connectivity stats, filterable issues, jump-to / fix |
| **Viewer** | Read-only review: high-altitude map, zoom into process steps, fullscreen, export PDF/PNG/SVG |
| **Global** | ⌘K palette, undo/redo, sample data, import/export, theme toggle, **AI chat** (Anthropic / OpenAI / Grok) |

## Project structure

```
app/                  # Next.js routes + globals
  api/workspace/      # REST GET/PUT for workspace documents
  api/chat/           # Streaming chat + tool calling
components/
  canvas/             # React Flow canvas, ProcessNode, edges, connect picker
  editor/             # SIPOC editor drawer
  library/            # Process catalog
  gaps/               # Issues dashboard
  viewer/             # Review mode + export (PDF/PNG/SVG)
  chat/               # In-app AI chat panel
  shared/             # AppShell, Navbar, CommandPalette
  ui/                 # Button, Dialog, Sheet, etc.
lib/
  types.ts            # Data model + Zod schemas
  syncTypes.ts        # Client/server sync protocol types
  clientSync.ts       # Debounced push + WebSocket client
  server/
    db.ts             # Prisma client
    userRepo.ts       # Postgres user store
    orgRepo.ts        # Postgres org + OU + memberships
    workspaceRepo.ts  # Postgres workspace documents (JSONB)
    syncHub.ts        # In-process WebSocket room hub
  holeDetection.ts    # Analysis / completeness
  graphUtils.ts       # Adjacency, path BFS, similarity
  workspaceOps.ts     # Pure workspace mutations (UI + MCP + chat)
  layout.ts           # Dagre layout helpers
  storage.ts          # localStorage + file I/O
  sampleData.ts       # Healthcare TPA demo workspace
  viewerExport.ts     # Viewer PNG / SVG / PDF export
  ai/
    providers.ts      # Anthropic / OpenAI / Grok model factory
    providerTypes.ts  # Provider ids (client-safe)
    sipocTools.ts     # AI SDK tools for live SIPOC mutations
    workspaceMutate.ts# Persist + syncHub broadcast for chat tools
mcp/
  server.ts           # MCP stdio server (tools / resources / prompts)
  workspaceService.ts # Load / mutate / analyze for MCP
server.ts             # Custom Next server + WebSocket /ws
store/
  workspaceStore.ts   # Zustand CRUD + history + sync hooks
```

## Sync & collaboration

Edits stay optimistic in **localStorage**. After each local save, a debounced background `PUT /api/workspace/default` writes to **PostgreSQL**. Connected browsers subscribe over **`/ws`** and receive `workspace:updated` pushes so multiple users can work on the same shared workspace (`id: "default"`).

## Auth & administration

- Session login with HTTP-only cookies
- Processes owned by organizational units (`ouId`) and users (`ownerUserId`)
- OU-scoped roles: viewer, editor, admin
- **Admin** tab (org admins): manage users, OUs, and access matrix

## In-app AI chat

The web app includes a chat drawer (navbar message icon, ⌘/Ctrl+J, or command palette) that talks to **Anthropic**, **OpenAI**, or **Grok**. The model can call the same SIPOC tools as MCP and mutate the live workspace; connected browsers refresh over WebSocket.

Copy [`.env.example`](.env.example) to `.env.local` and set at least one provider key:

| Env | Provider |
|-----|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI |
| `XAI_API_KEY` | Grok (xAI) |

Pick the provider in the chat header. Keys stay on the server; they are never sent to the browser.

**Chat vs MCP:** Chat is the model *inside* the app (`/api/chat`). MCP is a stdio tool server for *external* hosts (Cursor / Claude Desktop) — it does not call a model itself.

## MCP (external AI hosts)

SIPOC Weaver exposes a **stdio MCP server** so Cursor / Claude Desktop agents can read and edit the shared workspace.

```bash
npm run mcp
```

Project Cursor config lives in [`.cursor/mcp.json`](.cursor/mcp.json). Tools cover process CRUD, granular SIPOC fields (steps / suppliers / inputs / outputs / customers), I/O connections, hierarchy (`create_subprocess_from_step`), and gap analysis (`analyze_workspace`, `suggest_links`).

| Env | Default | Purpose |
|-----|---------|---------|
| `SIPOC_WORKSPACE_ID` | `default` | Workspace file id under `data/workspaces/` |
| `SIPOC_DATA_DIR` | `data/workspaces` | Override storage directory |
| `SIPOC_WEAVER_URL` | `http://localhost:3000` | When the web app is running, mutations `PUT` here so open browsers refresh over WebSocket |

Run `npm run dev` alongside the MCP host if you want live UI updates while an agent builds processes.

## Data model

See `lib/types.ts`. Core entities: `Workspace`, `Process`, `Connection`, plus nested `Supplier` / `Input` / `Output` / `Customer`. Connections are the source of truth for graph edges; I/O `source` / `destination` are kept in sync. JSON exports include `schemaVersion`.

## Hierarchy (process decomposition)

Processes can nest via `parentProcessId`. Steps are structured (`{ id, text, subprocessId? }`) so a high-level step can drill into a child SIPOC.

- **Map** shows one hierarchy level at a time (breadcrumbs + Drill in).
- **Explorer** shows the full tree; search flattens matches.
- **Editor** can set parent, link a step to a subprocess, or create a subprocess from a step.

I/O **Connections** remain for peer value-flow; hierarchy is separate.

Click **Sample** to load a demo: Group Sales → Member Enrollment → ID Card Production.

- Auto-saves to `localStorage` key `sipoc-weaver:workspace`
- Background-syncs to PostgreSQL via the workspace API
- **Export** downloads `{name}.sipoc.json`
- **Import** supports replace or merge

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + K` | Command palette |
| `⌘/Ctrl + J` | Toggle AI assistant |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` / `⌘/Ctrl + Y` | Redo |
| `Delete` / `Backspace` | Delete selected node/edge (map) |
| Double-click node | Open SIPOC editor |

## Scripts

```bash
npm run dev          # development server (HTTP + WebSocket)
npm run build        # prisma generate + production build
npm run start        # serve production with WebSocket
npm run lint         # ESLint
npm run mcp          # MCP stdio server for AI hosts
npm run db:migrate   # apply Prisma migrations
npm run db:seed      # seed demo users, OUs, memberships
npm run db:push      # push schema without migration (dev)
```

## License

Private / internal use unless otherwise noted.
