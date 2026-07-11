"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "sonner";

export function ConnectPicker() {
  const picker = useWorkspaceStore((s) => s.connectPicker);
  const close = useWorkspaceStore((s) => s.closeConnectPicker);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const addConnection = useWorkspaceStore((s) => s.addConnection);

  const open = !!picker?.open;
  const source = workspace.processes.find((p) => p.id === picker?.sourceProcessId);
  const target = workspace.processes.find((p) => p.id === picker?.targetProcessId);

  if (!open || !picker || !source || !target) {
    return null;
  }

  return (
    <ConnectPickerForm
      key={`${picker.sourceProcessId}-${picker.targetProcessId}-${picker.sourceOutputId}`}
      sourceName={source.name}
      targetName={target.name}
      outputs={source.outputs}
      inputs={target.inputs}
      initialOutputId={picker.sourceOutputId || source.outputs[0]?.id || ""}
      initialInputId={target.inputs[0]?.id || ""}
      onCancel={close}
      onConfirm={(outputId, inputId) => {
        addConnection(
          picker.sourceProcessId,
          outputId,
          picker.targetProcessId,
          inputId,
        );
        toast.success("Connection created");
      }}
    />
  );
}

function ConnectPickerForm({
  sourceName,
  targetName,
  outputs,
  inputs,
  initialOutputId,
  initialInputId,
  onCancel,
  onConfirm,
}: {
  sourceName: string;
  targetName: string;
  outputs: { id: string; name: string }[];
  inputs: { id: string; name: string }[];
  initialOutputId: string;
  initialInputId: string;
  onCancel: () => void;
  onConfirm: (outputId: string, inputId: string) => void;
}) {
  const [outputId, setOutputId] = useState(initialOutputId);
  const [inputId, setInputId] = useState(initialInputId);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect processes</DialogTitle>
          <DialogDescription>
            Choose which output from <strong>{sourceName}</strong> feeds which
            input on <strong>{targetName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Output (source)</Label>
            <Select value={outputId} onChange={(e) => setOutputId(e.target.value)}>
              {outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Input (target)</Label>
            <Select value={inputId} onChange={(e) => setInputId(e.target.value)}>
              {inputs.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!outputId || !inputId}
            onClick={() => onConfirm(outputId, inputId)}
          >
            Create link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
