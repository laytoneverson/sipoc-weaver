"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "sonner";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  if (!open) return null;
  return <CommandPaletteInner onOpenChange={onOpenChange} />;
}

function CommandPaletteInner({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const addProcess = useWorkspaceStore((s) => s.addProcess);
  const setView = useWorkspaceStore((s) => s.setView);
  const loadSample = useWorkspaceStore((s) => s.loadSample);
  const resetEmpty = useWorkspaceStore((s) => s.resetEmpty);
  const exportDownload = useWorkspaceStore((s) => s.exportDownload);
  const reanalyze = useWorkspaceStore((s) => s.reanalyze);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const openEditor = useWorkspaceStore((s) => s.openEditor);
  const clearHighlights = useWorkspaceStore((s) => s.clearHighlights);

  const commands = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: "new",
        label: "New Process",
        icon: <Plus className="h-4 w-4" />,
        run: () => {
          addProcess();
          setView("map");
        },
      },
      {
        id: "map",
        label: "Go to Map",
        icon: <LayoutGrid className="h-4 w-4" />,
        run: () => setView("map"),
      },
      {
        id: "library",
        label: "Go to Explorer",
        icon: <Search className="h-4 w-4" />,
        run: () => setView("library"),
      },
      {
        id: "gaps",
        label: "Go to Gaps",
        icon: <Sparkles className="h-4 w-4" />,
        run: () => setView("gaps"),
      },
      {
        id: "viewer",
        label: "Go to Viewer",
        hint: "Review & export",
        icon: <Eye className="h-4 w-4" />,
        run: () => setView("viewer"),
      },
      {
        id: "root",
        label: "Drill to workspace root",
        icon: <LayoutGrid className="h-4 w-4" />,
        run: () => {
          useWorkspaceStore.getState().drillToRoot();
          setView("map");
        },
      },
      {
        id: "analyze",
        label: "Re-analyze workspace",
        icon: <RefreshCw className="h-4 w-4" />,
        run: () => {
          reanalyze();
          toast.success("Analysis refreshed");
        },
      },
      {
        id: "sample",
        label: "Load sample data",
        icon: <Upload className="h-4 w-4" />,
        run: () => {
          loadSample();
          toast.success("Sample loaded");
        },
      },
      {
        id: "export",
        label: "Export workspace JSON",
        icon: <Download className="h-4 w-4" />,
        run: () => {
          exportDownload();
          toast.success("Exported");
        },
      },
      {
        id: "clear-hl",
        label: "Clear path highlights",
        icon: <Trash2 className="h-4 w-4" />,
        run: () => clearHighlights(),
      },
      {
        id: "reset",
        label: "Reset to empty workspace",
        hint: "Destructive",
        icon: <Trash2 className="h-4 w-4" />,
        run: () => {
          if (confirm("Clear all processes?")) {
            resetEmpty();
            toast.message("Workspace cleared");
          }
        },
      },
    ];

    const processCmds: CommandItem[] = workspace.processes.map((p) => ({
      id: `p-${p.id}`,
      label: `Open ${p.name}`,
      hint: "Process",
      icon: <Search className="h-4 w-4" />,
      run: () => {
        selectProcess(p.id);
        setView("map");
        openEditor(p.id);
      },
    }));

    return [...base, ...processCmds];
  }, [
    addProcess,
    setView,
    reanalyze,
    loadSample,
    exportDownload,
    clearHighlights,
    resetEmpty,
    workspace.processes,
    selectProcess,
    openEditor,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [commands, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[active];
        if (item) {
          item.run();
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, active, onOpenChange]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Type a command or search processes…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
              No matching commands
            </li>
          )}
          {filtered.map((item, idx) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  idx === active
                    ? "bg-[var(--accent)]"
                    : "hover:bg-[var(--accent)]/60",
                )}
                onMouseEnter={() => setActive(idx)}
                onClick={() => {
                  item.run();
                  onOpenChange(false);
                }}
              >
                <span className="text-[var(--muted-foreground)]">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.hint && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {item.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
