"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileImage,
  FileType2,
  Maximize2,
  Minimize2,
  Mountain,
} from "lucide-react";
import { toast } from "sonner";
import { HierarchyBreadcrumbs } from "@/components/shared/HierarchyBreadcrumbs";
import { Button } from "@/components/ui/button";
import {
  exportViewerElement,
  type ViewerExportFormat,
} from "@/lib/viewerExport";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { ViewerDetail } from "./ViewerDetail";
import { ViewerOverview } from "./ViewerOverview";

export function ViewerView() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const focusParentId = useWorkspaceStore((s) => s.focusParentId);
  const drillInto = useWorkspaceStore((s) => s.drillInto);
  const selectedProcessId = useWorkspaceStore((s) => s.selectedProcessId);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);

  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const detailProcess = selectedProcessId
    ? workspace.processes.find((p) => p.id === selectedProcessId)
    : null;

  // If selection is outside the current hierarchy focus, show altitude instead
  const detailInScope =
    detailProcess &&
    (detailProcess.parentProcessId ?? null) === focusParentId
      ? detailProcess
      : null;

  useEffect(() => {
    const onFsChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-export-menu]")) setExportMenuOpen(false);
    };
    // Defer so the opening click does not immediately close the menu
    const id = window.setTimeout(() => {
      document.addEventListener("click", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", onDoc);
    };
  }, [exportMenuOpen]);

  const altitudeLabel = detailInScope
    ? "Detail"
    : focusParentId
      ? "Mid altitude"
      : "High altitude";

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("Fullscreen is not available in this browser");
    }
  }, []);

  const handleExport = useCallback(
    async (format: ViewerExportFormat) => {
      const node = exportRef.current;
      if (!node) return;
      setExportMenuOpen(false);
      setExporting(true);
      try {
        const focusName = detailInScope
          ? detailInScope.name
          : focusParentId
            ? workspace.processes.find((p) => p.id === focusParentId)?.name ??
              workspace.name
            : workspace.name;
        const basename = `sipoc_viewer_${focusName}`;
        await exportViewerElement(node, format, basename);
        toast.success(`Exported ${format.toUpperCase()}`);
      } catch (err) {
        console.error(err);
        toast.error(`Could not export ${format.toUpperCase()}`);
      } finally {
        setExporting(false);
      }
    },
    [detailInScope, focusParentId, workspace.name, workspace.processes],
  );

  const openDetail = (processId: string) => {
    selectProcess(processId);
  };

  const closeDetail = () => {
    selectProcess(null);
  };

  const descend = (processId: string) => {
    drillInto(processId);
  };

  const openSubprocess = (processId: string) => {
    const child = workspace.processes.find((p) => p.id === processId);
    if (!child) return;
    useWorkspaceStore.setState({
      focusParentId: child.parentProcessId ?? null,
      selectedProcessId: processId,
    });
  };

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex h-full w-full flex-col bg-[var(--background)]",
        fullscreen && "bg-[var(--background)]",
      )}
    >
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--card)]/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4 text-[var(--primary)]" />
          Viewer
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
            <Mountain className="h-3 w-3" />
            {altitudeLabel}
          </span>
        </div>

        <div className="mx-2 hidden h-5 w-px bg-[var(--border)] sm:block" />

        <HierarchyBreadcrumbs
          className="min-w-0 flex-1"
          showUpButton={!detailInScope}
        />

        <div className="ml-auto flex items-center gap-1.5">
          {detailInScope && (
            <Button size="sm" variant="outline" onClick={closeDetail}>
              High altitude
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {fullscreen ? "Exit" : "Fullscreen"}
            </span>
          </Button>

          <div className="relative" data-export-menu>
            <Button
              size="sm"
              variant="default"
              disabled={exporting}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              onClick={() => setExportMenuOpen((o) => !o)}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
              >
                <ExportItem
                  icon={<FileImage className="h-3.5 w-3.5" />}
                  label="PNG image"
                  onClick={() => handleExport("png")}
                />
                <ExportItem
                  icon={<FileType2 className="h-3.5 w-3.5" />}
                  label="SVG vector"
                  onClick={() => handleExport("svg")}
                />
                <ExportItem
                  icon={<Download className="h-3.5 w-3.5" />}
                  label="PDF document"
                  onClick={() => handleExport("pdf")}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={exportRef}
          className="h-full w-full bg-[var(--canvas)]"
          data-viewer-export-root
        >
          {detailInScope ? (
            <ViewerDetail
              workspace={workspace}
              process={detailInScope}
              onBack={closeDetail}
              onOpenSubprocess={openSubprocess}
              onDescend={descend}
            />
          ) : (
            <ViewerOverview
              workspace={workspace}
              focusParentId={focusParentId}
              onOpenDetail={openDetail}
              onDescend={descend}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ExportItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--accent)]"
      onClick={onClick}
    >
      <span className="text-[var(--muted-foreground)]">{icon}</span>
      {label}
    </button>
  );
}
