"use client";

import { useRef } from "react";
import {
  Download,
  Moon,
  Redo2,
  Sun,
  Undo2,
  Upload,
  Workflow,
  Command,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseWorkspaceFile } from "@/lib/storage";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { ViewMode } from "@/lib/types";

const tabs: { id: ViewMode; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "library", label: "Explorer" },
  { id: "gaps", label: "Gaps" },
  { id: "viewer", label: "Viewer" },
];

export function Navbar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const view = useWorkspaceStore((s) => s.view);
  const setView = useWorkspaceStore((s) => s.setView);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysis = useWorkspaceStore((s) => s.analysis);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const past = useWorkspaceStore((s) => s.past);
  const future = useWorkspaceStore((s) => s.future);
  const exportDownload = useWorkspaceStore((s) => s.exportDownload);
  const importWorkspace = useWorkspaceStore((s) => s.importWorkspace);
  const loadSample = useWorkspaceStore((s) => s.loadSample);
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Workflow className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">SIPOC Weaver</div>
          <div className="max-w-[160px] truncate text-[10px] text-[var(--muted-foreground)]">
            {workspace.name}
          </div>
        </div>
      </div>

      <nav className="ml-4 flex items-center gap-1 rounded-lg bg-[var(--secondary)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              view === t.id
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {t.label}
            {t.id === "gaps" && (analysis?.stats.holeCount ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                {analysis?.stats.holeCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="hidden text-[var(--muted-foreground)] sm:inline-flex"
          onClick={onOpenCommand}
        >
          <Command className="h-3.5 w-3.5" />
          <span className="text-xs">⌘K</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={past.length === 0}
          onClick={() => undo()}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={future.length === 0}
          onClick={() => redo()}
          title="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            loadSample();
            toast.success("Sample healthcare workspace loaded");
          }}
        >
          Sample
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          title="Import JSON"
        >
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.sipoc.json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const ws = await parseWorkspaceFile(file);
              const mode = confirm(
                "OK = Replace workspace\nCancel = Merge into current",
              )
                ? "replace"
                : "merge";
              importWorkspace(ws, mode);
              toast.success(`Imported ${file.name}`);
            } catch {
              toast.error("Could not parse workspace file");
            }
            e.target.value = "";
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            exportDownload();
            toast.success("Workspace exported");
          }}
          title="Export JSON"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
