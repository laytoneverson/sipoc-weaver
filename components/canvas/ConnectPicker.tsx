"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
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
import { isCrossOuLink, ouName } from "@/lib/orgUtils";
import { useAuthStore } from "@/store/authStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { toast } from "sonner";

export function ConnectPicker() {
  const picker = useWorkspaceStore((s) => s.connectPicker);
  const close = useWorkspaceStore((s) => s.closeConnectPicker);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const addConnection = useWorkspaceStore((s) => s.addConnection);
  const organization = useAuthStore((s) => s.organization);

  const open = !!picker?.open;
  const source = workspace.processes.find((p) => p.id === picker?.sourceProcessId);
  const target = workspace.processes.find((p) => p.id === picker?.targetProcessId);
  const crossOu = isCrossOuLink(source, target);

  if (!open || !picker || !source || !target) {
    return null;
  }

  return (
    <ConnectPickerForm
      key={`${picker.sourceProcessId}-${picker.targetProcessId}-${picker.sourceOutputId}`}
      sourceName={source.name}
      targetName={target.name}
      sourceOu={ouName(organization, source.ouId)}
      targetOu={ouName(organization, target.ouId)}
      crossOu={crossOu}
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
        toast.success(
          crossOu ? "Cross-OU connection created" : "Connection created",
        );
      }}
    />
  );
}

function ConnectPickerForm({
  sourceName,
  targetName,
  sourceOu,
  targetOu,
  crossOu,
  outputs,
  inputs,
  initialOutputId,
  initialInputId,
  onCancel,
  onConfirm,
}: {
  sourceName: string;
  targetName: string;
  sourceOu: string;
  targetOu: string;
  crossOu: boolean;
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
            Link an output from <strong>{sourceName}</strong> ({sourceOu}) to an
            input on <strong>{targetName}</strong> ({targetOu}).
          </DialogDescription>
        </DialogHeader>

        {crossOu && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This link spans organizational units. Cross-OU connections remain
              visible to users with access to either side.
            </span>
          </div>
        )}

        <div className="grid gap-4 py-2">
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
            onClick={() => onConfirm(outputId, inputId)}
            disabled={!outputId || !inputId}
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
