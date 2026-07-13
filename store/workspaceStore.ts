"use client";

import { create } from "zustand";
import { analyzeWorkspace } from "@/lib/holeDetection";
import { getDownstreamIds, getUpstreamIds } from "@/lib/graphUtils";
import { newId, nowIso } from "@/lib/ids";
import { isCrossOuLink } from "@/lib/orgUtils";
import { useAuthStore } from "@/store/authStore";
import { createEmptyWorkspace, createSampleWorkspace } from "@/lib/sampleData";
import {
  downloadWorkspace,
  loadWorkspace,
  saveWorkspace,
  setAfterSaveListener,
} from "@/lib/storage";
import {
  getActiveSync,
  startWorkspaceSync,
} from "@/lib/clientSync";
import { DEFAULT_WORKSPACE_ID, type SyncStatus } from "@/lib/syncTypes";
import {
  addConnection as opAddConnection,
  addProcess as opAddProcess,
  createSubprocessFromStep as opCreateSubprocessFromStep,
  deleteProcess as opDeleteProcess,
  duplicateProcess as opDuplicateProcess,
  linkStepToSubprocess as opLinkStepToSubprocess,
  removeConnection as opRemoveConnection,
  setInputSourceExternal as opSetInputSourceExternal,
  setOutputDestinationExternal as opSetOutputDestinationExternal,
  setProcessParent as opSetProcessParent,
  syncIoFromConnections,
  unlinkInput as opUnlinkInput,
  unlinkOutput as opUnlinkOutput,
  updateProcess as opUpdateProcess,
} from "@/lib/workspaceOps";
import type {
  AnalysisResult,
  Customer,
  Input,
  Output,
  Process,
  Supplier,
  ViewMode,
  Workspace,
} from "@/lib/types";

const HISTORY_LIMIT = 50;

type HistorySnapshot = {
  workspace: Workspace;
};

export interface WorkspaceState {
  workspace: Workspace;
  analysis: AnalysisResult | null;
  hydrated: boolean;
  view: ViewMode;
  selectedProcessId: string | null;
  editorOpen: boolean;
  /** Map/explorer hierarchy focus: null = workspace root (top-level) */
  focusParentId: string | null;
  searchQuery: string;
  healthFilter: "all" | "green" | "yellow" | "red";
  holesOnly: boolean;
  tagFilter: string | null;
  highlightProcessIds: Set<string>;
  highlightEdgeIds: Set<string>;
  connectPicker: {
    open: boolean;
    sourceProcessId: string;
    sourceOutputId: string;
    targetProcessId: string;
  } | null;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  dirty: boolean;
  syncStatus: SyncStatus;
  syncDetail: string | null;

  // lifecycle
  hydrate: () => void;
  persist: () => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  applyRemoteWorkspace: (workspace: Workspace, revision: number) => boolean;
  setSyncStatus: (status: SyncStatus, detail?: string) => void;

  // view
  setView: (view: ViewMode) => void;
  setSearchQuery: (q: string) => void;
  setHealthFilter: (f: WorkspaceState["healthFilter"]) => void;
  setHolesOnly: (v: boolean) => void;
  setTagFilter: (tag: string | null) => void;
  selectProcess: (id: string | null, openEditor?: boolean) => void;
  openEditor: (id: string) => void;
  closeEditor: () => void;
  clearHighlights: () => void;
  traceUpstream: (processId: string) => void;
  traceDownstream: (processId: string) => void;

  // hierarchy navigation
  setFocusParent: (parentId: string | null) => void;
  drillInto: (processId: string) => void;
  drillUp: () => void;
  drillToRoot: () => void;

  // workspace ops
  loadSample: () => void;
  resetEmpty: () => void;
  importWorkspace: (ws: Workspace, mode: "replace" | "merge") => void;
  exportDownload: () => void;
  renameWorkspace: (name: string, description?: string) => void;
  reanalyze: () => void;

  // process CRUD
  addProcess: (partial?: Partial<Process>) => string;
  updateProcess: (id: string, patch: Partial<Process>) => void;
  deleteProcess: (id: string) => void;
  duplicateProcess: (id: string) => string | null;
  updateProcessPosition: (id: string, position: { x: number; y: number }) => void;
  applyLayoutPositions: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  setProcessParent: (
    processId: string,
    parentProcessId: string | undefined,
  ) => void;
  linkStepToSubprocess: (
    processId: string,
    stepId: string,
    subprocessId: string | undefined,
  ) => void;
  createSubprocessFromStep: (
    processId: string,
    stepId: string,
    name?: string,
  ) => string | null;

  // connections
  addConnection: (
    fromProcessId: string,
    fromOutputId: string,
    toProcessId: string,
    toInputId: string,
  ) => void;
  removeConnection: (id: string) => void;
  openConnectPicker: (payload: NonNullable<WorkspaceState["connectPicker"]>) => void;
  closeConnectPicker: () => void;

  // I/O helpers used by editor
  setInputSourceExternal: (
    processId: string,
    inputId: string,
    supplierId?: string,
  ) => void;
  setOutputDestinationExternal: (
    processId: string,
    outputId: string,
    customerId?: string,
  ) => void;
  unlinkInput: (processId: string, inputId: string) => void;
  unlinkOutput: (processId: string, outputId: string) => void;
}

function withAnalysis(ws: Workspace): Pick<WorkspaceState, "workspace" | "analysis"> {
  const synced = syncIoFromConnections(ws);
  const analysis = analyzeWorkspace(synced);
  return {
    workspace: { ...synced, lastAnalyzedAt: nowIso() },
    analysis,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: createEmptyWorkspace(),
  analysis: null,
  hydrated: false,
  view: "map",
  selectedProcessId: null,
  editorOpen: false,
  focusParentId: null,
  searchQuery: "",
  healthFilter: "all",
  holesOnly: false,
  tagFilter: null,
  highlightProcessIds: new Set(),
  highlightEdgeIds: new Set(),
  connectPicker: null,
  past: [],
  future: [],
  dirty: false,
  syncStatus: "idle",
  syncDetail: null,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadWorkspace();
    let base = stored ?? createSampleWorkspace();
    // Prefer the shared default id so browsers collaborate on one workspace
    if (base.id !== DEFAULT_WORKSPACE_ID) {
      base = { ...base, id: DEFAULT_WORKSPACE_ID };
    }
    const next = withAnalysis(base);
    set({ ...next, hydrated: true, dirty: false });
    if (!stored || stored.id !== DEFAULT_WORKSPACE_ID) {
      saveWorkspace(next.workspace);
    }

    setAfterSaveListener(() => {
      const sync = getActiveSync();
      if (sync && !sync.isApplyingRemote()) {
        sync.schedulePush();
      }
    });

    startWorkspaceSync(DEFAULT_WORKSPACE_ID, {
      getWorkspace: () => get().workspace,
      applyRemote: (workspace, revision) =>
        get().applyRemoteWorkspace(workspace, revision),
      onStatus: (status, detail) => get().setSyncStatus(status, detail),
    });

    if (typeof window !== "undefined") {
      const onUnload = () => {
        void getActiveSync()?.flush();
      };
      window.addEventListener("beforeunload", onUnload);
    }
  },

  setSyncStatus: (status, detail) =>
    set({ syncStatus: status, syncDetail: detail ?? null }),

  applyRemoteWorkspace: (workspace, revision) => {
    void revision;
    const normalized = {
      ...workspace,
      id: DEFAULT_WORKSPACE_ID,
    };
    const next = withAnalysis(normalized);
    set({
      ...next,
      dirty: false,
      // Drop local undo stack on remote authority to avoid inconsistent history
      past: [],
      future: [],
    });
    // Local persist; afterSaveListener skips push while applyingRemote
    saveWorkspace(next.workspace);
    return true;
  },

  persist: () => {
    saveWorkspace(get().workspace);
    set({ dirty: false });
  },

  pushHistory: () => {
    const { workspace, past } = get();
    const snapshot = {
      workspace: structuredClone(workspace),
    };
    const nextPast = [...past, snapshot].slice(-HISTORY_LIMIT);
    set({ past: nextPast, future: [], dirty: true });
  },

  undo: () => {
    const { past, workspace, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const nextPast = past.slice(0, -1);
    const next = withAnalysis(prev.workspace);
    set({
      ...next,
      past: nextPast,
      future: [{ workspace: structuredClone(workspace) }, ...future].slice(
        0,
        HISTORY_LIMIT,
      ),
      dirty: true,
    });
    saveWorkspace(next.workspace);
  },

  redo: () => {
    const { future, workspace, past } = get();
    if (future.length === 0) return;
    const nxt = future[0];
    const nextFuture = future.slice(1);
    const next = withAnalysis(nxt.workspace);
    set({
      ...next,
      past: [...past, { workspace: structuredClone(workspace) }].slice(
        -HISTORY_LIMIT,
      ),
      future: nextFuture,
      dirty: true,
    });
    saveWorkspace(next.workspace);
  },

  setView: (view) => set({ view }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setHealthFilter: (healthFilter) => set({ healthFilter }),
  setHolesOnly: (holesOnly) => set({ holesOnly }),
  setTagFilter: (tagFilter) => set({ tagFilter }),

  selectProcess: (id, openEditor = false) =>
    set({
      selectedProcessId: id,
      editorOpen: openEditor && !!id,
    }),

  openEditor: (id) => set({ selectedProcessId: id, editorOpen: true }),
  closeEditor: () => set({ editorOpen: false }),

  clearHighlights: () =>
    set({ highlightProcessIds: new Set(), highlightEdgeIds: new Set() }),

  setFocusParent: (parentId) =>
    set({ focusParentId: parentId, selectedProcessId: null }),

  drillInto: (processId) =>
    set({
      focusParentId: processId,
      selectedProcessId: null,
      view: "map",
      highlightProcessIds: new Set(),
      highlightEdgeIds: new Set(),
    }),

  drillUp: () => {
    const { workspace, focusParentId } = get();
    if (!focusParentId) return;
    const parent = workspace.processes.find((p) => p.id === focusParentId);
    set({
      focusParentId: parent?.parentProcessId ?? null,
      selectedProcessId: focusParentId,
    });
  },

  drillToRoot: () =>
    set({
      focusParentId: null,
      selectedProcessId: null,
      highlightProcessIds: new Set(),
      highlightEdgeIds: new Set(),
    }),

  traceUpstream: (processId) => {
    const { workspace } = get();
    const ids = getUpstreamIds(processId, workspace.connections);
    ids.add(processId);
    const edgeIds = new Set(
      workspace.connections
        .filter((c) => ids.has(c.fromProcessId) && ids.has(c.toProcessId))
        .map((c) => c.id),
    );
    set({ highlightProcessIds: ids, highlightEdgeIds: edgeIds, view: "map" });
  },

  traceDownstream: (processId) => {
    const { workspace } = get();
    const ids = getDownstreamIds(processId, workspace.connections);
    ids.add(processId);
    const edgeIds = new Set(
      workspace.connections
        .filter((c) => ids.has(c.fromProcessId) && ids.has(c.toProcessId))
        .map((c) => c.id),
    );
    set({ highlightProcessIds: ids, highlightEdgeIds: edgeIds, view: "map" });
  },

  loadSample: () => {
    get().pushHistory();
    const next = withAnalysis(createSampleWorkspace());
    set({
      ...next,
      selectedProcessId: null,
      editorOpen: false,
      focusParentId: null,
      dirty: false,
    });
    saveWorkspace(next.workspace);
  },

  resetEmpty: () => {
    get().pushHistory();
    const next = withAnalysis(createEmptyWorkspace());
    set({
      ...next,
      selectedProcessId: null,
      editorOpen: false,
      focusParentId: null,
      dirty: false,
    });
    saveWorkspace(next.workspace);
  },

  importWorkspace: (ws, mode) => {
    get().pushHistory();
    let merged: Workspace;
    if (mode === "replace") {
      merged = ws;
    } else {
      const current = get().workspace;
      const idMap = new Map<string, string>();
      const processes = [
        ...current.processes,
        ...ws.processes.map((p) => {
          const nid = newId();
          idMap.set(p.id, nid);
          return { ...structuredClone(p), id: nid };
        }),
      ];
      // Remap connection process ids (I/O ids stay as cloned)
      const connections = [
        ...current.connections,
        ...ws.connections.map((c) => ({
          ...c,
          id: newId(),
          fromProcessId: idMap.get(c.fromProcessId) ?? c.fromProcessId,
          toProcessId: idMap.get(c.toProcessId) ?? c.toProcessId,
        })),
      ];
      merged = {
        ...current,
        processes,
        connections,
        updatedAt: nowIso(),
      };
    }
    const next = withAnalysis(merged);
    set({ ...next, dirty: false });
    saveWorkspace(next.workspace);
  },

  exportDownload: () => downloadWorkspace(get().workspace),

  renameWorkspace: (name, description) => {
    get().pushHistory();
    const ws = {
      ...get().workspace,
      name,
      description: description ?? get().workspace.description,
      updatedAt: nowIso(),
    };
    set({ workspace: ws, dirty: true });
    saveWorkspace(ws);
  },

  reanalyze: () => {
    const next = withAnalysis(get().workspace);
    set({ ...next });
    saveWorkspace(next.workspace);
  },

  addProcess: (partial) => {
    get().pushHistory();
    const focusParentId = get().focusParentId;
    const auth = useAuthStore.getState();
    const { workspace, processId } = opAddProcess(get().workspace, {
      ...partial,
      parentProcessId:
        partial?.parentProcessId ?? focusParentId ?? undefined,
      ouId:
        partial?.ouId ??
        auth.activeOuId ??
        auth.accessibleOuIds[0] ??
        undefined,
      ownerUserId: partial?.ownerUserId ?? auth.user?.id,
    });
    const next = withAnalysis(workspace);
    set({
      ...next,
      selectedProcessId: processId,
      editorOpen: true,
      dirty: true,
    });
    saveWorkspace(next.workspace);
    return processId;
  },

  updateProcess: (id, patch) => {
    get().pushHistory();
    const next = withAnalysis(opUpdateProcess(get().workspace, id, patch));
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  deleteProcess: (id) => {
    get().pushHistory();
    const { workspace, parentId } = opDeleteProcess(get().workspace, id);
    const next = withAnalysis(workspace);
    const focusParentId =
      get().focusParentId === id
        ? (parentId ?? null)
        : get().focusParentId;
    set({
      ...next,
      focusParentId,
      selectedProcessId:
        get().selectedProcessId === id ? null : get().selectedProcessId,
      editorOpen: get().selectedProcessId === id ? false : get().editorOpen,
      dirty: true,
    });
    saveWorkspace(next.workspace);
  },

  duplicateProcess: (id) => {
    const result = opDuplicateProcess(get().workspace, id);
    if (!result) return null;
    get().pushHistory();
    const next = withAnalysis(result.workspace);
    set({ ...next, selectedProcessId: result.processId, dirty: true });
    saveWorkspace(next.workspace);
    return result.processId;
  },

  setProcessParent: (processId, parentProcessId) => {
    const workspace = opSetProcessParent(
      get().workspace,
      processId,
      parentProcessId,
    );
    if (!workspace) return;
    get().pushHistory();
    const next = withAnalysis(workspace);
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  linkStepToSubprocess: (processId, stepId, subprocessId) => {
    const workspace = opLinkStepToSubprocess(
      get().workspace,
      processId,
      stepId,
      subprocessId,
    );
    if (!workspace) return;
    get().pushHistory();
    const next = withAnalysis(workspace);
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  createSubprocessFromStep: (processId, stepId, name) => {
    const result = opCreateSubprocessFromStep(
      get().workspace,
      processId,
      stepId,
      name,
    );
    if (!result) return null;
    get().pushHistory();
    const next = withAnalysis(result.workspace);
    set({
      ...next,
      selectedProcessId: result.processId,
      editorOpen: true,
      dirty: true,
    });
    saveWorkspace(next.workspace);
    return result.processId;
  },

  updateProcessPosition: (id, position) => {
    // Don't push history on every drag tick — caller should debounce / on drag end
    const ws = {
      ...get().workspace,
      processes: get().workspace.processes.map((p) =>
        p.id === id ? { ...p, position, updatedAt: nowIso() } : p,
      ),
      updatedAt: nowIso(),
    };
    set({ workspace: ws, dirty: true });
    saveWorkspace(ws);
  },

  applyLayoutPositions: (positions) => {
    get().pushHistory();
    const ws = {
      ...get().workspace,
      processes: get().workspace.processes.map((p) =>
        positions[p.id]
          ? { ...p, position: positions[p.id], updatedAt: nowIso() }
          : p,
      ),
      updatedAt: nowIso(),
    };
    set({ workspace: ws, dirty: true });
    saveWorkspace(ws);
  },

  addConnection: (fromProcessId, fromOutputId, toProcessId, toInputId) => {
    const processes = get().workspace.processes;
    const from = processes.find((p) => p.id === fromProcessId);
    const to = processes.find((p) => p.id === toProcessId);
    const result = opAddConnection(
      get().workspace,
      fromProcessId,
      fromOutputId,
      toProcessId,
      toInputId,
      { crossOu: isCrossOuLink(from, to) },
    );
    if (!result) return;
    get().pushHistory();
    const next = withAnalysis(result.workspace);
    set({ ...next, connectPicker: null, dirty: true });
    saveWorkspace(next.workspace);
  },

  removeConnection: (id) => {
    get().pushHistory();
    const next = withAnalysis(opRemoveConnection(get().workspace, id));
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  openConnectPicker: (payload) => set({ connectPicker: payload }),
  closeConnectPicker: () => set({ connectPicker: null }),

  setInputSourceExternal: (processId, inputId, supplierId) => {
    get().pushHistory();
    const next = withAnalysis(
      opSetInputSourceExternal(get().workspace, processId, inputId, supplierId),
    );
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  setOutputDestinationExternal: (processId, outputId, customerId) => {
    get().pushHistory();
    const next = withAnalysis(
      opSetOutputDestinationExternal(
        get().workspace,
        processId,
        outputId,
        customerId,
      ),
    );
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  unlinkInput: (processId, inputId) => {
    get().pushHistory();
    const next = withAnalysis(
      opUnlinkInput(get().workspace, processId, inputId),
    );
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  unlinkOutput: (processId, outputId) => {
    get().pushHistory();
    const next = withAnalysis(
      opUnlinkOutput(get().workspace, processId, outputId),
    );
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },
}));

// Re-export nested types for convenience in editor
export type { Supplier, Input, Output, Customer, Process };
