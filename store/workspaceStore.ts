"use client";

import { create } from "zustand";
import { computeCompleteness, analyzeWorkspace } from "@/lib/holeDetection";
import { getDownstreamIds, getUpstreamIds } from "@/lib/graphUtils";
import { newId, nowIso } from "@/lib/ids";
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
  normalizeSteps,
  wouldCreateHierarchyCycle,
} from "@/lib/hierarchy";
import type {
  AnalysisResult,
  Connection,
  Customer,
  Input,
  Output,
  Process,
  ProcessStep,
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

function enrichCompleteness(ws: Workspace): Workspace {
  return {
    ...ws,
    processes: ws.processes.map((p) => ({
      ...p,
      completenessScore: computeCompleteness(p, ws.connections),
    })),
  };
}

function syncIoFromConnections(ws: Workspace): Workspace {
  const processes = ws.processes.map((p) => ({
    ...p,
    inputs: p.inputs.map((i) => {
      const c = ws.connections.find(
        (x) => x.toProcessId === p.id && x.toInputId === i.id,
      );
      if (c) {
        return {
          ...i,
          source: {
            type: "linked_output" as const,
            processId: c.fromProcessId,
            outputId: c.fromOutputId,
          },
        };
      }
      if (i.source?.type === "linked_output") {
        return { ...i, source: undefined };
      }
      return i;
    }),
    outputs: p.outputs.map((o) => {
      const c = ws.connections.find(
        (x) => x.fromProcessId === p.id && x.fromOutputId === o.id,
      );
      if (c) {
        return {
          ...o,
          destination: {
            type: "linked_input" as const,
            processId: c.toProcessId,
            inputId: c.toInputId,
          },
        };
      }
      if (o.destination?.type === "linked_input") {
        return { ...o, destination: undefined };
      }
      return o;
    }),
  }));
  return enrichCompleteness({ ...ws, processes, updatedAt: nowIso() });
}

function withAnalysis(ws: Workspace): Pick<WorkspaceState, "workspace" | "analysis"> {
  const synced = syncIoFromConnections(ws);
  const analysis = analyzeWorkspace(synced);
  return {
    workspace: { ...synced, lastAnalyzedAt: nowIso() },
    analysis,
  };
}

function defaultSteps(): ProcessStep[] {
  return normalizeSteps([
    "Step 1",
    "Step 2",
    "Step 3",
    "Step 4",
    "Step 5",
  ]);
}

function blankProcess(partial?: Partial<Process>): Process {
  const now = nowIso();
  return {
    id: newId(),
    name: partial?.name ?? "New Process",
    description: partial?.description ?? "",
    tags: partial?.tags ?? [],
    owner: partial?.owner,
    steps: partial?.steps
      ? normalizeSteps(partial.steps as ProcessStep[])
      : defaultSteps(),
    suppliers: partial?.suppliers ?? [],
    inputs: partial?.inputs ?? [],
    outputs: partial?.outputs ?? [],
    customers: partial?.customers ?? [],
    parentProcessId: partial?.parentProcessId,
    position: partial?.position ?? {
      x: 120 + Math.random() * 200,
      y: 120 + Math.random() * 200,
    },
    createdAt: now,
    updatedAt: now,
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
    const process = blankProcess({
      ...partial,
      parentProcessId:
        partial?.parentProcessId ?? focusParentId ?? undefined,
    });
    const ws = {
      ...get().workspace,
      processes: [...get().workspace.processes, process],
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({
      ...next,
      selectedProcessId: process.id,
      editorOpen: true,
      dirty: true,
    });
    saveWorkspace(next.workspace);
    return process.id;
  },

  updateProcess: (id, patch) => {
    get().pushHistory();
    const ws = {
      ...get().workspace,
      processes: get().workspace.processes.map((p) =>
        p.id === id
          ? { ...p, ...patch, id: p.id, updatedAt: nowIso() }
          : p,
      ),
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  deleteProcess: (id) => {
    get().pushHistory();
    const deleted = get().workspace.processes.find((p) => p.id === id);
    const parentId = deleted?.parentProcessId;
    // Promote children one level up; clear step links pointing at deleted
    const processes = get()
      .workspace.processes.filter((p) => p.id !== id)
      .map((p) => ({
        ...p,
        parentProcessId:
          p.parentProcessId === id ? parentId : p.parentProcessId,
        steps: p.steps.map((s) =>
          s.subprocessId === id ? { ...s, subprocessId: undefined } : s,
        ),
      }));
    const ws = {
      ...get().workspace,
      processes,
      connections: get().workspace.connections.filter(
        (c) => c.fromProcessId !== id && c.toProcessId !== id,
      ),
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
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
    const src = get().workspace.processes.find((p) => p.id === id);
    if (!src) return null;
    get().pushHistory();
    const clone = structuredClone(src);
    clone.id = newId();
    clone.name = `${src.name} (copy)`;
    clone.createdAt = nowIso();
    clone.updatedAt = nowIso();
    clone.position = {
      x: (src.position?.x ?? 0) + 40,
      y: (src.position?.y ?? 0) + 40,
    };
    // new IDs for nested entities so links don't collide
    const remap = new Map<string, string>();
    const rem = (old: string) => {
      const n = newId();
      remap.set(old, n);
      return n;
    };
    clone.suppliers = clone.suppliers.map((s) => ({ ...s, id: rem(s.id) }));
    clone.inputs = clone.inputs.map((i) => ({
      ...i,
      id: rem(i.id),
      source: i.source?.type === "supplier" ? i.source : undefined,
    }));
    clone.outputs = clone.outputs.map((o) => ({
      ...o,
      id: rem(o.id),
      destination:
        o.destination?.type === "customer" ? o.destination : undefined,
    }));
    clone.customers = clone.customers.map((c) => ({ ...c, id: rem(c.id) }));
    clone.steps = clone.steps.map((s) => ({
      ...s,
      id: rem(s.id),
      subprocessId: undefined,
    }));

    const ws = {
      ...get().workspace,
      processes: [...get().workspace.processes, clone],
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({ ...next, selectedProcessId: clone.id, dirty: true });
    saveWorkspace(next.workspace);
    return clone.id;
  },

  setProcessParent: (processId, parentProcessId) => {
    if (
      wouldCreateHierarchyCycle(
        get().workspace.processes,
        processId,
        parentProcessId,
      )
    ) {
      return;
    }
    get().pushHistory();
    const ws = {
      ...get().workspace,
      processes: get().workspace.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              parentProcessId: parentProcessId || undefined,
              updatedAt: nowIso(),
            }
          : p,
      ),
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  linkStepToSubprocess: (processId, stepId, subprocessId) => {
    if (
      subprocessId &&
      wouldCreateHierarchyCycle(
        get().workspace.processes,
        subprocessId,
        processId,
      )
    ) {
      return;
    }
    get().pushHistory();
    const processes = get().workspace.processes.map((p) => {
      if (p.id !== processId) {
        // If adopting as child, set parent when linking
        if (subprocessId && p.id === subprocessId && !p.parentProcessId) {
          return { ...p, parentProcessId: processId, updatedAt: nowIso() };
        }
        return p;
      }
      return {
        ...p,
        steps: p.steps.map((s) =>
          s.id === stepId
            ? { ...s, subprocessId: subprocessId || undefined }
            : s,
        ),
        updatedAt: nowIso(),
      };
    });
    // Ensure subprocess is child of this process when linking
    const linked = processes.map((p) => {
      if (subprocessId && p.id === subprocessId) {
        return {
          ...p,
          parentProcessId: processId,
          updatedAt: nowIso(),
        };
      }
      return p;
    });
    const next = withAnalysis({
      ...get().workspace,
      processes: linked,
      updatedAt: nowIso(),
    });
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  createSubprocessFromStep: (processId, stepId, name) => {
    const parent = get().workspace.processes.find((p) => p.id === processId);
    const step = parent?.steps.find((s) => s.id === stepId);
    if (!parent || !step) return null;
    get().pushHistory();
    const child = blankProcess({
      name: name ?? step.text,
      description: `Subprocess of “${parent.name}” · step “${step.text}”`,
      parentProcessId: processId,
      tags: [...parent.tags],
      position: {
        x: (parent.position?.x ?? 100) + 80,
        y: (parent.position?.y ?? 100) + 80,
      },
    });
    const processes = [
      ...get().workspace.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId ? { ...s, subprocessId: child.id } : s,
              ),
              updatedAt: nowIso(),
            }
          : p,
      ),
      child,
    ];
    const next = withAnalysis({
      ...get().workspace,
      processes,
      updatedAt: nowIso(),
    });
    set({
      ...next,
      selectedProcessId: child.id,
      editorOpen: true,
      dirty: true,
    });
    saveWorkspace(next.workspace);
    return child.id;
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
    if (fromProcessId === toProcessId) return;
    const exists = get().workspace.connections.some(
      (c) =>
        c.fromProcessId === fromProcessId &&
        c.fromOutputId === fromOutputId &&
        c.toProcessId === toProcessId &&
        c.toInputId === toInputId,
    );
    if (exists) return;
    get().pushHistory();
    const connection: Connection = {
      id: newId(),
      fromProcessId,
      fromOutputId,
      toProcessId,
      toInputId,
      createdAt: nowIso(),
    };
    const ws = {
      ...get().workspace,
      connections: [...get().workspace.connections, connection],
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({ ...next, connectPicker: null, dirty: true });
    saveWorkspace(next.workspace);
  },

  removeConnection: (id) => {
    get().pushHistory();
    const ws = {
      ...get().workspace,
      connections: get().workspace.connections.filter((c) => c.id !== id),
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  openConnectPicker: (payload) => set({ connectPicker: payload }),
  closeConnectPicker: () => set({ connectPicker: null }),

  setInputSourceExternal: (processId, inputId, supplierId) => {
    get().pushHistory();
    // remove any link connection first
    const connections = get().workspace.connections.filter(
      (c) => !(c.toProcessId === processId && c.toInputId === inputId),
    );
    const processes = get().workspace.processes.map((p) => {
      if (p.id !== processId) return p;
      return {
        ...p,
        inputs: p.inputs.map((i) =>
          i.id === inputId
            ? {
                ...i,
                source: { type: "supplier" as const, supplierId },
              }
            : i,
        ),
        updatedAt: nowIso(),
      };
    });
    const next = withAnalysis({
      ...get().workspace,
      processes,
      connections,
      updatedAt: nowIso(),
    });
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  setOutputDestinationExternal: (processId, outputId, customerId) => {
    get().pushHistory();
    const connections = get().workspace.connections.filter(
      (c) => !(c.fromProcessId === processId && c.fromOutputId === outputId),
    );
    const processes = get().workspace.processes.map((p) => {
      if (p.id !== processId) return p;
      return {
        ...p,
        outputs: p.outputs.map((o) =>
          o.id === outputId
            ? {
                ...o,
                destination: { type: "customer" as const, customerId },
              }
            : o,
        ),
        updatedAt: nowIso(),
      };
    });
    const next = withAnalysis({
      ...get().workspace,
      processes,
      connections,
      updatedAt: nowIso(),
    });
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  unlinkInput: (processId, inputId) => {
    get().pushHistory();
    const connections = get().workspace.connections.filter(
      (c) => !(c.toProcessId === processId && c.toInputId === inputId),
    );
    const processes = get().workspace.processes.map((p) => {
      if (p.id !== processId) return p;
      return {
        ...p,
        inputs: p.inputs.map((i) =>
          i.id === inputId ? { ...i, source: undefined } : i,
        ),
        updatedAt: nowIso(),
      };
    });
    const next = withAnalysis({
      ...get().workspace,
      processes,
      connections,
      updatedAt: nowIso(),
    });
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },

  unlinkOutput: (processId, outputId) => {
    get().pushHistory();
    const connections = get().workspace.connections.filter(
      (c) => !(c.fromProcessId === processId && c.fromOutputId === outputId),
    );
    const processes = get().workspace.processes.map((p) => {
      if (p.id !== processId) return p;
      return {
        ...p,
        outputs: p.outputs.map((o) =>
          o.id === outputId ? { ...o, destination: undefined } : o,
        ),
        updatedAt: nowIso(),
      };
    });
    const next = withAnalysis({
      ...get().workspace,
      processes,
      connections,
      updatedAt: nowIso(),
    });
    set({ ...next, dirty: true });
    saveWorkspace(next.workspace);
  },
}));

// Re-export nested types for convenience in editor
export type { Supplier, Input, Output, Customer, Process };
