import type { Edge, Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import type { Workspace } from "./types";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR",
): { nodes: Node[]; edges: Edge[] } {
  const g = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagreLayout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      targetPosition: direction === "LR" ? Position.Left : Position.Top,
      sourcePosition: direction === "LR" ? Position.Right : Position.Bottom,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function workspaceToFlow(
  workspace: Workspace,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = workspace.processes.map((p) => ({
    id: p.id,
    type: "process",
    position: p.position ?? { x: 0, y: 0 },
    data: { processId: p.id },
  }));

  const edges: Edge[] = workspace.connections.map((c) => ({
    id: c.id,
    source: c.fromProcessId,
    target: c.toProcessId,
    sourceHandle: `out-${c.fromOutputId}`,
    targetHandle: `in-${c.toInputId}`,
    type: "connection",
    data: {
      connectionId: c.id,
      crossOu: c.crossOu,
      label: (() => {
        const from = workspace.processes.find((p) => p.id === c.fromProcessId);
        return from?.outputs.find((o) => o.id === c.fromOutputId)?.name ?? "";
      })(),
    },
  }));

  return { nodes, edges };
}
