<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- SIPOC Weaver is a single frontend-only Next.js 16 (App Router, Turbopack) app. There is no backend or database: all state persists to browser `localStorage` (key `sipoc-weaver:workspace`) with JSON export/import. So there is no separate service to start.
- Standard commands live in `README.md`/`package.json` scripts: `npm run dev` (dev server, port 3000), `npm run lint`, `npm run build`, `npm run start`. There are no automated tests.
- On first page load the app auto-seeds a "Healthcare Benefits TPA" sample workspace, so the canvas is populated without any manual data setup — useful for quick manual verification.
