"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LayoutGrid,
  Maximize2,
  Plus,
  Search,
  Focus,
} from "lucide-react";
import { toast } from "sonner";
import { ProcessNode, type ProcessFlowNode } from "./ProcessNode";
import { ConnectionEdge, type ConnectionFlowEdge } from "./ConnectionEdge";
import { getLayoutedElements, workspaceToFlow } from "@/lib/layout";
import { getScopedProcesses } from "@/lib/hierarchy";
import { healthFromScore } from "@/lib/holeDetection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HierarchyBreadcrumbs } from "@/components/shared/HierarchyBreadcrumbs";
import { useWorkspaceStore } from "@/store/workspaceStore";

const nodeTypes = { process: ProcessNode };
const edgeTypes = { connection: ConnectionEdge };

function CanvasInner() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const focusParentId = useWorkspaceStore((s) => s.focusParentId);
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const healthFilter = useWorkspaceStore((s) => s.healthFilter);
  const holesOnly = useWorkspaceStore((s) => s.holesOnly);
  const tagFilter = useWorkspaceStore((s) => s.tagFilter);
  const analysis = useWorkspaceStore((s) => s.analysis);
  const selectedProcessId = useWorkspaceStore((s) => s.selectedProcessId);
  const highlightProcessIds = useWorkspaceStore((s) => s.highlightProcessIds);
  const addProcess = useWorkspaceStore((s) => s.addProcess);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const openEditor = useWorkspaceStore((s) => s.openEditor);
  const updateProcessPosition = useWorkspaceStore((s) => s.updateProcessPosition);
  const applyLayoutPositions = useWorkspaceStore((s) => s.applyLayoutPositions);
  const addConnection = useWorkspaceStore((s) => s.addConnection);
  const openConnectPicker = useWorkspaceStore((s) => s.openConnectPicker);
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery);
  const pushHistory = useWorkspaceStore((s) => s.pushHistory);
  const deleteProcess = useWorkspaceStore((s) => s.deleteProcess);
  const removeConnection = useWorkspaceStore((s) => s.removeConnection);
  const drillInto = useWorkspaceStore((s) => s.drillInto);

  const { fitView, getNodes, getEdges, setCenter } = useReactFlow();
  const dragStarted = useRef(false);

  const scopedProcesses = useMemo(
    () => getScopedProcesses(workspace.processes, focusParentId),
    [workspace.processes, focusParentId],
  );

  const scopedWorkspace = useMemo(
    () => ({
      ...workspace,
      processes: scopedProcesses,
      connections: workspace.connections.filter(
        (c) =>
          scopedProcesses.some((p) => p.id === c.fromProcessId) &&
          scopedProcesses.some((p) => p.id === c.toProcessId),
      ),
    }),
    [workspace, scopedProcesses],
  );

  const { nodes: baseNodes, edges: baseEdges } = useMemo(
    () => workspaceToFlow(scopedWorkspace),
    [scopedWorkspace],
  );

  const filteredNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return new Set(
      scopedProcesses
        .filter((p) => {
          const score = p.completenessScore ?? 0;
          const health = healthFromScore(score);
          if (healthFilter !== "all" && health !== healthFilter) return false;
          if (tagFilter && !p.tags.includes(tagFilter)) return false;
          if (holesOnly) {
            const hasHole = analysis?.issues.some(
              (i) =>
                i.processId === p.id &&
                (i.severity === "high" || i.severity === "medium"),
            );
            if (!hasHole) return false;
          }
          if (!q) return true;
          const hay = [
            p.name,
            p.description,
            p.owner ?? "",
            ...p.tags,
            ...p.steps.map((s) => s.text),
            ...p.inputs.map((i) => i.name),
            ...p.outputs.map((o) => o.name),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((p) => p.id),
    );
  }, [
    scopedProcesses,
    searchQuery,
    healthFilter,
    tagFilter,
    holesOnly,
    analysis,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ProcessFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ConnectionFlowEdge>([]);

  useEffect(() => {
    setNodes(
      baseNodes.map((n) => ({
        ...n,
        hidden: !filteredNodeIds.has(n.id),
        selected: n.id === selectedProcessId,
        data: { processId: n.id },
      })) as ProcessFlowNode[],
    );
    setEdges(
      baseEdges.map((e) => ({
        ...e,
        hidden:
          !filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target),
        animated: highlightProcessIds.has(e.source) && highlightProcessIds.has(e.target),
      })) as ConnectionFlowEdge[],
    );
  }, [
    baseNodes,
    baseEdges,
    filteredNodeIds,
    selectedProcessId,
    highlightProcessIds,
    setNodes,
    setEdges,
  ]);

  // Focus selected process when jumping from library/gaps
  useEffect(() => {
    if (!selectedProcessId) return;
    const node = workspace.processes.find((p) => p.id === selectedProcessId);
    if (node?.position) {
      setCenter(node.position.x + 140, node.position.y + 80, {
        zoom: 1.1,
        duration: 400,
      });
    }
  }, [selectedProcessId, setCenter, workspace.processes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceHandle = connection.sourceHandle ?? "";
      const targetHandle = connection.targetHandle ?? "";

      const fromOutputId = sourceHandle.startsWith("out-")
        ? sourceHandle.slice(4)
        : null;
      const toInputId = targetHandle.startsWith("in-")
        ? targetHandle.slice(3)
        : null;

      const sourceProcess = workspace.processes.find(
        (p) => p.id === connection.source,
      );
      const targetProcess = workspace.processes.find(
        (p) => p.id === connection.target,
      );
      if (!sourceProcess || !targetProcess) return;

      if (fromOutputId && toInputId && fromOutputId !== "default" && toInputId !== "default") {
        addConnection(
          connection.source,
          fromOutputId,
          connection.target,
          toInputId,
        );
        toast.success("Connection created");
        return;
      }

      // Need picker when handles are generic or ambiguous
      const outId =
        fromOutputId && fromOutputId !== "default"
          ? fromOutputId
          : sourceProcess.outputs[0]?.id;
      if (!outId) {
        toast.error("Add an output to the source process first");
        openEditor(connection.source);
        return;
      }
      if (targetProcess.inputs.length === 0) {
        toast.error("Add an input to the target process first");
        openEditor(connection.target);
        return;
      }
      if (targetProcess.inputs.length === 1 && fromOutputId && fromOutputId !== "default") {
        addConnection(
          connection.source,
          outId,
          connection.target,
          targetProcess.inputs[0].id,
        );
        toast.success("Connection created");
        return;
      }
      openConnectPicker({
        open: true,
        sourceProcessId: connection.source,
        sourceOutputId: outId,
        targetProcessId: connection.target,
      });
    },
    [workspace.processes, addConnection, openConnectPicker, openEditor],
  );

  const onNodeDragStart = useCallback(() => {
    if (!dragStarted.current) {
      pushHistory();
      dragStarted.current = true;
    }
  }, [pushHistory]);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      updateProcessPosition(node.id, node.position);
      dragStarted.current = false;
    },
    [updateProcessPosition],
  );

  const onSelectionChange = useCallback(
    ({ nodes: sel }: OnSelectionChangeParams) => {
      if (sel.length === 1) selectProcess(sel[0].id);
    },
    [selectProcess],
  );

  const onAutoLayout = useCallback(() => {
    const layouted = getLayoutedElements(
      getNodes() as Node[],
      getEdges() as Edge[],
      "LR",
    );
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of layouted.nodes) {
      positions[n.id] = n.position;
    }
    applyLayoutPositions(positions);
    setNodes(layouted.nodes as ProcessFlowNode[]);
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
    toast.success("Auto-layout applied");
  }, [getNodes, getEdges, applyLayoutPositions, setNodes, fitView]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        const selectedNodes = getNodes().filter((n) => n.selected);
        const selectedEdges = getEdges().filter((ed) => ed.selected);
        if (selectedNodes.length) {
          selectedNodes.forEach((n) => deleteProcess(n.id));
          toast.message("Process deleted");
        }
        if (selectedEdges.length) {
          selectedEdges.forEach((ed) => {
            const connId = (ed.data as { connectionId?: string })?.connectionId ?? ed.id;
            removeConnection(connId);
          });
          toast.message("Connection removed");
        }
      }
    },
    [getNodes, getEdges, deleteProcess, removeConnection],
  );

  useEffect(() => {
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 350 }));
  }, [focusParentId, fitView]);

  return (
    <div className="h-full w-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_, n) => openEditor(n.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.75}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="bg-[var(--canvas)]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--canvas-dot)"
        />
        <Controls className="!bg-[var(--card)] !border-[var(--border)] !shadow-lg [&>button]:!bg-[var(--card)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--foreground)]" />
        <MiniMap
          className="!bg-[var(--card)] !border-[var(--border)]"
          nodeColor={(n) => {
            const p = workspace.processes.find((x) => x.id === n.id);
            const h = healthFromScore(p?.completenessScore ?? 0);
            return h === "green" ? "#34d399" : h === "yellow" ? "#fbbf24" : "#f87171";
          }}
          maskColor="rgba(0,0,0,0.55)"
        />
        <Panel
          position="top-left"
          className="flex max-w-[min(720px,90vw)] flex-col gap-2"
        >
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 shadow-sm backdrop-blur">
            <HierarchyBreadcrumbs />
            {scopedProcesses.length === 0 && (
              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                No processes at this level. Add one, or go up in the breadcrumb.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => addProcess()}>
              <Plus className="h-4 w-4" />
              Add Process
            </Button>
            <Button size="sm" variant="secondary" onClick={onAutoLayout}>
              <LayoutGrid className="h-4 w-4" />
              Auto-layout
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fitView({ padding: 0.2, duration: 300 })}
            >
              <Maximize2 className="h-4 w-4" />
              Fit
            </Button>
            {selectedProcessId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditor(selectedProcessId)}
              >
                <Focus className="h-4 w-4" />
                Edit
              </Button>
            )}
            {selectedProcessId &&
              workspace.processes.some(
                (p) => p.parentProcessId === selectedProcessId,
              ) && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => drillInto(selectedProcessId)}
                >
                  Drill in
                </Button>
              )}
          </div>
        </Panel>
        <Panel position="top-right" className="w-56">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
            <Input
              className="pl-8 bg-[var(--card)]"
              placeholder="Search map…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
