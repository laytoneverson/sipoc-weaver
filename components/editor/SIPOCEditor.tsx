"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Link2,
  Link2Off,
  Plus,
  Trash2,
  GripVertical,
  Layers,
  CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";
import { issuesForProcess } from "@/lib/holeDetection";
import { filledStepCount, getAncestorChain } from "@/lib/hierarchy";
import { newId } from "@/lib/ids";
import { cn, formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type {
  Customer,
  Input as SipocInput,
  Output,
  ProcessStep,
  Supplier,
} from "@/lib/types";

export function SIPOCEditor() {
  const editorOpen = useWorkspaceStore((s) => s.editorOpen);
  const closeEditor = useWorkspaceStore((s) => s.closeEditor);
  const selectedProcessId = useWorkspaceStore((s) => s.selectedProcessId);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const updateProcess = useWorkspaceStore((s) => s.updateProcess);
  const deleteProcess = useWorkspaceStore((s) => s.deleteProcess);
  const addConnection = useWorkspaceStore((s) => s.addConnection);
  const setInputSourceExternal = useWorkspaceStore((s) => s.setInputSourceExternal);
  const setOutputDestinationExternal = useWorkspaceStore(
    (s) => s.setOutputDestinationExternal,
  );
  const unlinkInput = useWorkspaceStore((s) => s.unlinkInput);
  const unlinkOutput = useWorkspaceStore((s) => s.unlinkOutput);
  const traceUpstream = useWorkspaceStore((s) => s.traceUpstream);
  const traceDownstream = useWorkspaceStore((s) => s.traceDownstream);
  const setProcessParent = useWorkspaceStore((s) => s.setProcessParent);
  const linkStepToSubprocess = useWorkspaceStore((s) => s.linkStepToSubprocess);
  const createSubprocessFromStep = useWorkspaceStore(
    (s) => s.createSubprocessFromStep,
  );
  const drillInto = useWorkspaceStore((s) => s.drillInto);
  const openEditor = useWorkspaceStore((s) => s.openEditor);
  const selectProcess = useWorkspaceStore((s) => s.selectProcess);
  const setView = useWorkspaceStore((s) => s.setView);

  const process = workspace.processes.find((p) => p.id === selectedProcessId);
  const issues = useMemo(
    () => (process ? issuesForProcess(workspace, process.id) : []),
    [workspace, process],
  );

  if (!process) {
    return (
      <Sheet open={editorOpen} onOpenChange={(o) => !o && closeEditor()}>
        <SheetHeader onClose={closeEditor}>
          <SheetTitle>No process selected</SheetTitle>
        </SheetHeader>
      </Sheet>
    );
  }

  const otherProcesses = workspace.processes.filter((p) => p.id !== process.id);
  const ancestors = getAncestorChain(workspace.processes, process.id);
  const childCount = workspace.processes.filter(
    (p) => p.parentProcessId === process.id,
  ).length;

  // Candidates for parent / subprocess: not self, not descendants
  const parentCandidates = otherProcesses.filter((p) => {
    let cur: typeof p | undefined = p;
    const seen = new Set<string>();
    while (cur?.parentProcessId) {
      if (cur.parentProcessId === process.id) return false;
      if (seen.has(cur.parentProcessId)) break;
      seen.add(cur.parentProcessId);
      cur = workspace.processes.find((x) => x.id === cur!.parentProcessId);
    }
    return true;
  });

  const patch = (partial: Parameters<typeof updateProcess>[1]) => {
    updateProcess(process.id, partial);
  };

  return (
    <Sheet open={editorOpen} onOpenChange={(o) => !o && closeEditor()}>
      <SheetHeader onClose={closeEditor}>
        <SheetTitle className="truncate">{process.name || "Untitled process"}</SheetTitle>
        <p className="text-xs text-[var(--muted-foreground)]">
          Updated {formatRelative(process.updatedAt)} · {process.completenessScore ?? 0}%
          complete
          {ancestors.length > 0 && (
            <> · under {ancestors.map((a) => a.name).join(" › ")}</>
          )}
        </p>
      </SheetHeader>
      <SheetBody className="space-y-8 pb-16">
        {/* Header fields */}
        <section className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={process.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={process.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                value={process.owner ?? ""}
                onChange={(e) => patch({ owner: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={process.tags.join(", ")}
                onChange={(e) =>
                  patch({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parent">Parent process</Label>
            <Select
              id="parent"
              value={process.parentProcessId ?? ""}
              onChange={(e) =>
                setProcessParent(process.id, e.target.value || undefined)
              }
            >
              <option value="">None (top-level)</option>
              {parentCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                traceUpstream(process.id);
                closeEditor();
              }}
            >
              Trace upstream
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                traceDownstream(process.id);
                closeEditor();
              }}
            >
              Trace downstream
            </Button>
            {childCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  drillInto(process.id);
                  closeEditor();
                  setView("map");
                }}
              >
                <Layers className="h-3.5 w-3.5" />
                Drill into children ({childCount})
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete "${process.name}"?`)) {
                  deleteProcess(process.id);
                  toast.message("Process deleted");
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </section>

        {/* Issues */}
        {issues.length > 0 && (
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Issues ({issues.length})
            </div>
            <ul className="space-y-1.5 text-xs text-[var(--muted-foreground)]">
              {issues.slice(0, 8).map((i) => (
                <li key={i.id} className="flex gap-2">
                  <Badge
                    variant={
                      i.severity === "high"
                        ? "danger"
                        : i.severity === "medium"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {i.severity}
                  </Badge>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Suppliers */}
        <ListSection
          title="Suppliers"
          onAdd={() => {
            const s: Supplier = {
              id: newId(),
              name: "New supplier",
              type: "external",
            };
            patch({ suppliers: [...process.suppliers, s] });
          }}
        >
          {process.suppliers.map((s, idx) => (
            <div key={s.id} className="flex gap-2">
              <Input
                value={s.name}
                onChange={(e) => {
                  const suppliers = [...process.suppliers];
                  suppliers[idx] = { ...s, name: e.target.value };
                  patch({ suppliers });
                }}
              />
              <Select
                value={s.type}
                onChange={(e) => {
                  const suppliers = [...process.suppliers];
                  suppliers[idx] = {
                    ...s,
                    type: e.target.value as Supplier["type"],
                  };
                  patch({ suppliers });
                }}
                className="w-32"
              >
                <option value="external">External</option>
                <option value="internal">Internal</option>
                <option value="system">System</option>
                <option value="process">Process</option>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  patch({
                    suppliers: process.suppliers.filter((x) => x.id !== s.id),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </ListSection>

        {/* Inputs */}
        <ListSection
          title="Inputs"
          onAdd={() => {
            const i: SipocInput = { id: newId(), name: "New input" };
            patch({ inputs: [...process.inputs, i] });
          }}
        >
          {process.inputs.map((inp, idx) => {
            const linked = inp.source?.type === "linked_output";
            const external = inp.source?.type === "supplier";
            return (
              <div
                key={inp.id}
                className="space-y-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex gap-2">
                  <Input
                    value={inp.name}
                    onChange={(e) => {
                      const inputs = [...process.inputs];
                      inputs[idx] = { ...inp, name: e.target.value };
                      patch({ inputs });
                    }}
                    placeholder="Input name"
                  />
                  <Badge variant={linked || external ? "success" : "danger"}>
                    {linked ? "Linked" : external ? "External" : "Unlinked"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      patch({
                        inputs: process.inputs.filter((x) => x.id !== inp.id),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={inp.description ?? ""}
                  onChange={(e) => {
                    const inputs = [...process.inputs];
                    inputs[idx] = { ...inp, description: e.target.value };
                    patch({ inputs });
                  }}
                  placeholder="Description (optional)"
                />
                <div className="flex flex-wrap gap-2">
                  <Select
                    className="flex-1"
                    value={
                      linked
                        ? `link:${inp.source?.processId}:${inp.source?.outputId}`
                        : external
                          ? "external"
                          : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        unlinkInput(process.id, inp.id);
                      } else if (v === "external") {
                        setInputSourceExternal(process.id, inp.id);
                      } else if (v.startsWith("link:")) {
                        const [, pid, oid] = v.split(":");
                        addConnection(pid, oid, process.id, inp.id);
                        toast.success("Linked to upstream output");
                      }
                    }}
                  >
                    <option value="">No source (hole)</option>
                    <option value="external">External supplier</option>
                    {otherProcesses.flatMap((p) =>
                      p.outputs.map((o) => (
                        <option key={`${p.id}-${o.id}`} value={`link:${p.id}:${o.id}`}>
                          {p.name} → {o.name}
                        </option>
                      )),
                    )}
                  </Select>
                  {(linked || external) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlinkInput(process.id, inp.id)}
                    >
                      <Link2Off className="h-3.5 w-3.5" />
                      Unlink
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </ListSection>

        {/* Steps */}
        <ListSection
          title={`Process Steps (${filledStepCount(process)})`}
          hint="Recommended: 5–7 steps. Link a step to a deeper SIPOC to drill down."
          onAdd={() => {
            const step: ProcessStep = { id: newId(), text: "New step" };
            patch({ steps: [...process.steps, step] });
          }}
        >
          {process.steps.map((step, idx) => {
            const sub = step.subprocessId
              ? workspace.processes.find((p) => p.id === step.subprocessId)
              : undefined;
            return (
              <div
                key={step.id}
                className="space-y-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                  <span className="w-5 text-xs text-[var(--muted-foreground)]">
                    {idx + 1}.
                  </span>
                  <Input
                    value={step.text}
                    onChange={(e) => {
                      const steps = [...process.steps];
                      steps[idx] = { ...step, text: e.target.value };
                      patch({ steps });
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      patch({
                        steps: process.steps.filter((s) => s.id !== step.id),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      disabled={idx === 0}
                      onClick={() => {
                        if (idx === 0) return;
                        const steps = [...process.steps];
                        [steps[idx - 1], steps[idx]] = [
                          steps[idx],
                          steps[idx - 1],
                        ];
                        patch({ steps });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      disabled={idx === process.steps.length - 1}
                      onClick={() => {
                        if (idx >= process.steps.length - 1) return;
                        const steps = [...process.steps];
                        [steps[idx + 1], steps[idx]] = [
                          steps[idx],
                          steps[idx + 1],
                        ];
                        patch({ steps });
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7">
                  <CornerDownRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <Select
                    className="min-w-[180px] flex-1"
                    value={step.subprocessId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__create__") {
                        const id = createSubprocessFromStep(
                          process.id,
                          step.id,
                        );
                        if (id) {
                          toast.success("Subprocess created and linked");
                          openEditor(id);
                        }
                      } else {
                        linkStepToSubprocess(
                          process.id,
                          step.id,
                          v || undefined,
                        );
                        if (v) toast.success("Step linked to subprocess");
                      }
                    }}
                  >
                    <option value="">No subprocess (plain step)</option>
                    <option value="__create__">+ Create subprocess from step…</option>
                    {parentCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  {sub && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        closeEditor();
                        drillInto(process.id);
                        setView("map");
                        selectProcess(sub.id);
                      }}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Open {sub.name}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {(() => {
            const n = filledStepCount(process);
            if (n > 0 && (n < 5 || n > 7)) {
              return (
                <p className="text-xs text-amber-400">
                  Soft warning: SIPOC processes typically have 5–7 steps
                  (currently {n}).
                </p>
              );
            }
            return null;
          })()}
        </ListSection>

        {/* Outputs */}
        <ListSection
          title="Outputs"
          onAdd={() => {
            const o: Output = { id: newId(), name: "New output" };
            patch({ outputs: [...process.outputs, o] });
          }}
        >
          {process.outputs.map((out, idx) => {
            const linked = out.destination?.type === "linked_input";
            const external = out.destination?.type === "customer";
            return (
              <div
                key={out.id}
                className="space-y-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex gap-2">
                  <Input
                    value={out.name}
                    onChange={(e) => {
                      const outputs = [...process.outputs];
                      outputs[idx] = { ...out, name: e.target.value };
                      patch({ outputs });
                    }}
                  />
                  <Badge variant={linked || external ? "success" : "danger"}>
                    {linked ? "Linked" : external ? "External" : "Orphan"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      patch({
                        outputs: process.outputs.filter((x) => x.id !== out.id),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    className="flex-1"
                    value={
                      linked
                        ? `link:${out.destination?.processId}:${out.destination?.inputId}`
                        : external
                          ? "external"
                          : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        unlinkOutput(process.id, out.id);
                      } else if (v === "external") {
                        setOutputDestinationExternal(process.id, out.id);
                      } else if (v.startsWith("link:")) {
                        const [, pid, iid] = v.split(":");
                        addConnection(process.id, out.id, pid, iid);
                        toast.success("Linked to downstream input");
                      }
                    }}
                  >
                    <option value="">No destination (hole)</option>
                    <option value="external">External customer</option>
                    {otherProcesses.flatMap((p) =>
                      p.inputs.map((i) => (
                        <option key={`${p.id}-${i.id}`} value={`link:${p.id}:${i.id}`}>
                          {p.name} ← {i.name}
                        </option>
                      )),
                    )}
                  </Select>
                  {(linked || external) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlinkOutput(process.id, out.id)}
                    >
                      <Link2Off className="h-3.5 w-3.5" />
                      Unlink
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </ListSection>

        {/* Customers */}
        <ListSection
          title="Customers"
          onAdd={() => {
            const c: Customer = {
              id: newId(),
              name: "New customer",
              type: "external",
            };
            patch({ customers: [...process.customers, c] });
          }}
        >
          {process.customers.map((c, idx) => (
            <div key={c.id} className="flex gap-2">
              <Input
                value={c.name}
                onChange={(e) => {
                  const customers = [...process.customers];
                  customers[idx] = { ...c, name: e.target.value };
                  patch({ customers });
                }}
              />
              <Select
                value={c.type}
                onChange={(e) => {
                  const customers = [...process.customers];
                  customers[idx] = {
                    ...c,
                    type: e.target.value as Customer["type"],
                  };
                  patch({ customers });
                }}
                className="w-32"
              >
                <option value="external">External</option>
                <option value="internal">Internal</option>
                <option value="system">System</option>
                <option value="process">Process</option>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  patch({
                    customers: process.customers.filter((x) => x.id !== c.id),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </ListSection>

        <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Link2 className="h-3.5 w-3.5" />
          Changes auto-save to local storage. Links stay intact when you rename I/Os.
        </p>
      </SheetBody>
    </Sheet>
  );
}

function ListSection({
  title,
  hint,
  onAdd,
  children,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && (
            <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <div className={cn("space-y-2", !children && "text-sm text-[var(--muted-foreground)]")}>
        {children}
      </div>
    </section>
  );
}
