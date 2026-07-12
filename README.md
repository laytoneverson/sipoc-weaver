# SIPOC Weaver

Interactive process-mapping web app for defining SIPOC processes, linking Inputs ↔ Outputs across processes, exploring the ecosystem on a canvas, and automatically detecting gaps (“holes”).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first load, a **Healthcare Benefits TPA** sample workspace is created (enrollment → eligibility → claims, plus ID cards and data vault) with intentional holes for the Gaps view.

## Tech stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS v4** + custom shadcn-style primitives
- **@xyflow/react** (React Flow) + **@dagrejs/dagre** auto-layout
- **Zustand** for workspace state + undo/redo
- **Zod** for workspace import validation
- **Fuse.js** fuzzy search in Library
- **localStorage** primary persistence + background server sync
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
| **Global** | ⌘K palette, undo/redo, sample data, import/export, theme toggle |

## Project structure

```
app/                  # Next.js routes + globals
components/
  canvas/             # React Flow canvas, ProcessNode, edges, connect picker
  editor/             # SIPOC editor drawer
  library/            # Process catalog
  gaps/               # Issues dashboard
  viewer/             # Review mode + export (PDF/PNG/SVG)
  shared/             # AppShell, Navbar, CommandPalette
  ui/                 # Button, Dialog, Sheet, etc.
lib/
  types.ts            # Data model + Zod schemas
  syncTypes.ts        # Client/server sync protocol types
  clientSync.ts       # Debounced push + WebSocket client
  server/
    workspaceRepo.ts  # File-backed server workspace store
    syncHub.ts        # In-process WebSocket room hub
  holeDetection.ts    # Analysis / completeness
  graphUtils.ts       # Adjacency, path BFS, similarity
  layout.ts           # Dagre layout helpers
  storage.ts          # localStorage + file I/O
  sampleData.ts       # Healthcare TPA demo workspace
  viewerExport.ts     # Viewer PNG / SVG / PDF export
server.ts             # Custom Next server + WebSocket /ws
app/api/workspace/    # REST GET/PUT for workspace documents
store/
  workspaceStore.ts   # Zustand CRUD + history + sync hooks
```

## Sync & collaboration

Edits stay optimistic in **localStorage**. After each local save, a debounced background `PUT /api/workspace/default` writes to `data/workspaces/`. Connected browsers subscribe over **`/ws`** and receive `workspace:updated` pushes so multiple users can work on the same shared workspace (`id: "default"`).

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
- Background-syncs to server JSON under `data/workspaces/`
- **Export** downloads `{name}.sipoc.json`
- **Import** supports replace or merge

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + K` | Command palette |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` / `⌘/Ctrl + Y` | Redo |
| `Delete` / `Backspace` | Delete selected node/edge (map) |
| Double-click node | Open SIPOC editor |

## Extending (v0.3 sketch)

1. Swap `lib/server/workspaceRepo.ts` for Postgres + Prisma models mirroring `Process` / `Connection`.
2. Auth (Auth.js or Supabase) + per-user / multi-workspace rooms.
3. CRDT / yjs for finer-grained collaborative canvas edits (vs whole-document LWW).

## Scripts

```bash
npm run dev      # development server (HTTP + WebSocket)
npm run build    # production build
npm run start    # serve production with WebSocket
npm run lint     # ESLint
```

## License

Private / internal use unless otherwise noted.
