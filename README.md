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
- **localStorage** persistence + JSON export/import
- **next-themes** dark/light mode (dark-first)
- **sonner** toasts, **lucide-react** icons

## Features (MVP)

| Area | Capabilities |
|------|----------------|
| **Map** | Custom process nodes with health borders, I/O handles, drag-to-connect, edge labels, minimap, search/filter, auto-layout, fit view, delete key |
| **Editor** | Full SIPOC drawer (suppliers, inputs, steps, outputs, customers), live issue list, link/unlink I/O, trace up/downstream |
| **Library** | Fuzzy search, health/tag/holes filters, jump to map / open editor |
| **Gaps** | Completeness + connectivity stats, filterable issues, jump-to / fix actions, name-similarity link suggestions |
| **Global** | ⌘K command palette, undo/redo, sample data, import/export `.sipoc.json`, theme toggle |

## Project structure

```
app/                  # Next.js routes + globals
components/
  canvas/             # React Flow canvas, ProcessNode, edges, connect picker
  editor/             # SIPOC editor drawer
  library/            # Process catalog
  gaps/               # Issues dashboard
  shared/             # AppShell, Navbar, CommandPalette
  ui/                 # Button, Dialog, Sheet, etc.
lib/
  types.ts            # Data model + Zod schemas
  holeDetection.ts    # Analysis / completeness
  graphUtils.ts       # Adjacency, path BFS, similarity
  layout.ts           # Dagre layout helpers
  storage.ts          # localStorage + file I/O
  sampleData.ts       # Healthcare TPA demo workspace
store/
  workspaceStore.ts   # Zustand CRUD + history
```

## Data model

See `lib/types.ts`. Core entities: `Workspace`, `Process`, `Connection`, plus nested `Supplier` / `Input` / `Output` / `Customer`. Connections are the source of truth for graph edges; I/O `source` / `destination` are kept in sync. JSON exports include `schemaVersion: 1`.

## Persistence

- Auto-saves to `localStorage` key `sipoc-weaver:workspace`
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

## Extending (v0.2 sketch)

1. Add Postgres + Prisma models mirroring `Process` / `Connection`.
2. Auth (Auth.js or Supabase) + multi-workspace.
3. Replace `storage.ts` with server actions / tRPC; keep Zustand as optimistic UI cache.
4. Optional: Supabase Realtime or yjs for collaborative canvas.

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```

## License

Private / internal use unless otherwise noted.
