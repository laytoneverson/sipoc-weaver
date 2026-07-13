import { computeCompleteness } from "@/lib/holeDetection";
import { normalizeSteps, wouldCreateHierarchyCycle } from "@/lib/hierarchy";
import { newId, nowIso } from "@/lib/ids";
import type {
  Connection,
  Customer,
  Input,
  Output,
  Process,
  ProcessStep,
  Supplier,
  Workspace,
} from "@/lib/types";

export function enrichCompleteness(ws: Workspace): Workspace {
  return {
    ...ws,
    processes: ws.processes.map((p) => ({
      ...p,
      completenessScore: computeCompleteness(p, ws.connections),
    })),
  };
}

/** Sync I/O source/destination from connections and stamp completeness + updatedAt. */
export function syncIoFromConnections(ws: Workspace): Workspace {
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

/** Sync I/O and stamp updatedAt (analysis is left to callers). */
export function prepareWorkspace(ws: Workspace): Workspace {
  return syncIoFromConnections(ws);
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

export function blankProcess(partial?: Partial<Process>): Process {
  const now = nowIso();
  return {
    id: newId(),
    name: partial?.name ?? "New Process",
    description: partial?.description ?? "",
    tags: partial?.tags ?? [],
    owner: partial?.owner,
    ownerUserId: partial?.ownerUserId,
    ouId: partial?.ouId,
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

export type AddProcessResult = { workspace: Workspace; processId: string };

export function addProcess(
  ws: Workspace,
  partial?: Partial<Process>,
): AddProcessResult {
  const process = blankProcess(partial);
  return {
    workspace: {
      ...ws,
      processes: [...ws.processes, process],
      updatedAt: nowIso(),
    },
    processId: process.id,
  };
}

export function updateProcess(
  ws: Workspace,
  id: string,
  patch: Partial<Process>,
): Workspace {
  return {
    ...ws,
    processes: ws.processes.map((p) =>
      p.id === id ? { ...p, ...patch, id: p.id, updatedAt: nowIso() } : p,
    ),
    updatedAt: nowIso(),
  };
}

export type DeleteProcessResult = {
  workspace: Workspace;
  /** Parent of deleted process (for UI focus adjustment) */
  parentId: string | undefined;
};

export function deleteProcess(
  ws: Workspace,
  id: string,
): DeleteProcessResult {
  const deleted = ws.processes.find((p) => p.id === id);
  const parentId = deleted?.parentProcessId;
  const processes = ws.processes
    .filter((p) => p.id !== id)
    .map((p) => ({
      ...p,
      parentProcessId:
        p.parentProcessId === id ? parentId : p.parentProcessId,
      steps: p.steps.map((s) =>
        s.subprocessId === id ? { ...s, subprocessId: undefined } : s,
      ),
    }));
  return {
    workspace: {
      ...ws,
      processes,
      connections: ws.connections.filter(
        (c) => c.fromProcessId !== id && c.toProcessId !== id,
      ),
      updatedAt: nowIso(),
    },
    parentId,
  };
}

export type DuplicateProcessResult = {
  workspace: Workspace;
  processId: string;
} | null;

export function duplicateProcess(
  ws: Workspace,
  id: string,
): DuplicateProcessResult {
  const src = ws.processes.find((p) => p.id === id);
  if (!src) return null;
  const clone = structuredClone(src);
  clone.id = newId();
  clone.name = `${src.name} (copy)`;
  clone.createdAt = nowIso();
  clone.updatedAt = nowIso();
  clone.position = {
    x: (src.position?.x ?? 0) + 40,
    y: (src.position?.y ?? 0) + 40,
  };
  const rem = (old: string) => {
    void old;
    return newId();
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

  return {
    workspace: {
      ...ws,
      processes: [...ws.processes, clone],
      updatedAt: nowIso(),
    },
    processId: clone.id,
  };
}

export function setProcessParent(
  ws: Workspace,
  processId: string,
  parentProcessId: string | undefined,
): Workspace | null {
  if (wouldCreateHierarchyCycle(ws.processes, processId, parentProcessId)) {
    return null;
  }
  return {
    ...ws,
    processes: ws.processes.map((p) =>
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
}

export function linkStepToSubprocess(
  ws: Workspace,
  processId: string,
  stepId: string,
  subprocessId: string | undefined,
): Workspace | null {
  if (
    subprocessId &&
    wouldCreateHierarchyCycle(ws.processes, subprocessId, processId)
  ) {
    return null;
  }
  const processes = ws.processes.map((p) => {
    if (p.id !== processId) {
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
  return {
    ...ws,
    processes: linked,
    updatedAt: nowIso(),
  };
}

export type CreateSubprocessResult = {
  workspace: Workspace;
  processId: string;
} | null;

export function createSubprocessFromStep(
  ws: Workspace,
  processId: string,
  stepId: string,
  name?: string,
): CreateSubprocessResult {
  const parent = ws.processes.find((p) => p.id === processId);
  const step = parent?.steps.find((s) => s.id === stepId);
  if (!parent || !step) return null;
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
    ...ws.processes.map((p) =>
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
  return {
    workspace: {
      ...ws,
      processes,
      updatedAt: nowIso(),
    },
    processId: child.id,
  };
}

export type AddConnectionResult = {
  workspace: Workspace;
  connectionId: string;
} | null;

export function addConnection(
  ws: Workspace,
  fromProcessId: string,
  fromOutputId: string,
  toProcessId: string,
  toInputId: string,
  options?: { crossOu?: boolean },
): AddConnectionResult {
  if (fromProcessId === toProcessId) return null;
  const exists = ws.connections.some(
    (c) =>
      c.fromProcessId === fromProcessId &&
      c.fromOutputId === fromOutputId &&
      c.toProcessId === toProcessId &&
      c.toInputId === toInputId,
  );
  if (exists) return null;
  const connection: Connection = {
    id: newId(),
    fromProcessId,
    fromOutputId,
    toProcessId,
    toInputId,
    crossOu: options?.crossOu,
    createdAt: nowIso(),
  };
  return {
    workspace: {
      ...ws,
      connections: [...ws.connections, connection],
      updatedAt: nowIso(),
    },
    connectionId: connection.id,
  };
}

export function removeConnection(ws: Workspace, id: string): Workspace {
  return {
    ...ws,
    connections: ws.connections.filter((c) => c.id !== id),
    updatedAt: nowIso(),
  };
}

function requireProcess(
  ws: Workspace,
  processId: string,
): Process | undefined {
  return ws.processes.find((p) => p.id === processId);
}

export type AddEntityResult = {
  workspace: Workspace;
  entityId: string;
} | null;

export function addStep(
  ws: Workspace,
  processId: string,
  text: string,
): AddEntityResult {
  const process = requireProcess(ws, processId);
  if (!process) return null;
  const step: ProcessStep = { id: newId(), text };
  return {
    workspace: updateProcess(ws, processId, {
      steps: [...process.steps, step],
    }),
    entityId: step.id,
  };
}

export function addSupplier(
  ws: Workspace,
  processId: string,
  name: string,
  type: Supplier["type"] = "external",
  linkedProcessId?: string,
): AddEntityResult {
  const process = requireProcess(ws, processId);
  if (!process) return null;
  const supplier: Supplier = {
    id: newId(),
    name,
    type,
    processId: linkedProcessId,
  };
  return {
    workspace: updateProcess(ws, processId, {
      suppliers: [...process.suppliers, supplier],
    }),
    entityId: supplier.id,
  };
}

export function addInput(
  ws: Workspace,
  processId: string,
  name: string,
  description?: string,
): AddEntityResult {
  const process = requireProcess(ws, processId);
  if (!process) return null;
  const input: Input = { id: newId(), name, description };
  return {
    workspace: updateProcess(ws, processId, {
      inputs: [...process.inputs, input],
    }),
    entityId: input.id,
  };
}

export function addOutput(
  ws: Workspace,
  processId: string,
  name: string,
  description?: string,
): AddEntityResult {
  const process = requireProcess(ws, processId);
  if (!process) return null;
  const output: Output = { id: newId(), name, description };
  return {
    workspace: updateProcess(ws, processId, {
      outputs: [...process.outputs, output],
    }),
    entityId: output.id,
  };
}

export function addCustomer(
  ws: Workspace,
  processId: string,
  name: string,
  type: Customer["type"] = "external",
  linkedProcessId?: string,
): AddEntityResult {
  const process = requireProcess(ws, processId);
  if (!process) return null;
  const customer: Customer = {
    id: newId(),
    name,
    type,
    processId: linkedProcessId,
  };
  return {
    workspace: updateProcess(ws, processId, {
      customers: [...process.customers, customer],
    }),
    entityId: customer.id,
  };
}

export function setInputSourceExternal(
  ws: Workspace,
  processId: string,
  inputId: string,
  supplierId?: string,
): Workspace {
  const connections = ws.connections.filter(
    (c) => !(c.toProcessId === processId && c.toInputId === inputId),
  );
  const processes = ws.processes.map((p) => {
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
  return {
    ...ws,
    processes,
    connections,
    updatedAt: nowIso(),
  };
}

export function setOutputDestinationExternal(
  ws: Workspace,
  processId: string,
  outputId: string,
  customerId?: string,
): Workspace {
  const connections = ws.connections.filter(
    (c) => !(c.fromProcessId === processId && c.fromOutputId === outputId),
  );
  const processes = ws.processes.map((p) => {
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
  return {
    ...ws,
    processes,
    connections,
    updatedAt: nowIso(),
  };
}

export function unlinkInput(
  ws: Workspace,
  processId: string,
  inputId: string,
): Workspace {
  const connections = ws.connections.filter(
    (c) => !(c.toProcessId === processId && c.toInputId === inputId),
  );
  const processes = ws.processes.map((p) => {
    if (p.id !== processId) return p;
    return {
      ...p,
      inputs: p.inputs.map((i) =>
        i.id === inputId ? { ...i, source: undefined } : i,
      ),
      updatedAt: nowIso(),
    };
  });
  return {
    ...ws,
    processes,
    connections,
    updatedAt: nowIso(),
  };
}

export function unlinkOutput(
  ws: Workspace,
  processId: string,
  outputId: string,
): Workspace {
  const connections = ws.connections.filter(
    (c) => !(c.fromProcessId === processId && c.fromOutputId === outputId),
  );
  const processes = ws.processes.map((p) => {
    if (p.id !== processId) return p;
    return {
      ...p,
      outputs: p.outputs.map((o) =>
        o.id === outputId ? { ...o, destination: undefined } : o,
      ),
      updatedAt: nowIso(),
    };
  });
  return {
    ...ws,
    processes,
    connections,
    updatedAt: nowIso(),
  };
}
