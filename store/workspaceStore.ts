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
} from "@/lib/storage";
import type {
  AnalysisResult,
  Connection,
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

  // lifecycle
  hydrate: () => void;
  persist: () => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

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

function blankProcess(partial?: Partial<Process>): Process {
  const now = nowIso();
  return {
    id: newId(),
    name: partial?.name ?? "New Process",
    description: partial?.description ?? "",
    tags: partial?.tags ?? [],
    owner: partial?.owner,
    steps: partial?.steps ?? ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
    suppliers: partial?.suppliers ?? [],
    inputs: partial?.inputs ?? [],
    outputs: partial?.outputs ?? [],
    customers: partial?.customers ?? [],
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

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadWorkspace();
    const base = stored ?? createSampleWorkspace();
    const next = withAnalysis(base);
    set({ ...next, hydrated: true, dirty: false });
    if (!stored) saveWorkspace(next.workspace);
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
    const process = blankProcess(partial);
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
    const ws = {
      ...get().workspace,
      processes: get().workspace.processes.filter((p) => p.id !== id),
      connections: get().workspace.connections.filter(
        (c) => c.fromProcessId !== id && c.toProcessId !== id,
      ),
      updatedAt: nowIso(),
    };
    const next = withAnalysis(ws);
    set({
      ...next,
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
