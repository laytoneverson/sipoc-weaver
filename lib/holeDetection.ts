import { findCycleProcessIds, getNodeDegree, nameSimilarity } from "./graphUtils";
import type {
  AnalysisResult,
  Connection,
  Issue,
  Process,
  Workspace,
} from "./types";

/** Compute 0–100 completeness for a single process */
export function computeCompleteness(
  process: Process,
  connections: Connection[],
): number {
  let score = 0;
  const weights = {
    name: 10,
    description: 5,
    steps: 20,
    suppliers: 10,
    inputs: 15,
    outputs: 15,
    customers: 10,
    linkedIo: 15,
  };

  if (process.name.trim()) score += weights.name;
  if (process.description.trim()) score += weights.description;

  const stepCount = process.steps.filter((s) => s.trim()).length;
  if (stepCount >= 5 && stepCount <= 7) score += weights.steps;
  else if (stepCount > 0) score += Math.round(weights.steps * 0.5);

  if (process.suppliers.length > 0) score += weights.suppliers;
  if (process.inputs.length > 0) score += weights.inputs;
  if (process.outputs.length > 0) score += weights.outputs;
  if (process.customers.length > 0) score += weights.customers;

  const totalIo = process.inputs.length + process.outputs.length;
  if (totalIo > 0) {
    let linked = 0;
    for (const inp of process.inputs) {
      const has =
        !!inp.source ||
        connections.some(
          (c) => c.toProcessId === process.id && c.toInputId === inp.id,
        );
      if (has) linked++;
    }
    for (const out of process.outputs) {
      const has =
        !!out.destination ||
        connections.some(
          (c) => c.fromProcessId === process.id && c.fromOutputId === out.id,
        );
      if (has) linked++;
    }
    score += Math.round(weights.linkedIo * (linked / totalIo));
  }

  return Math.min(100, Math.max(0, score));
}

export function healthFromScore(score: number): "green" | "yellow" | "red" {
  if (score >= 75) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

export function analyzeWorkspace(workspace: Workspace): AnalysisResult {
  const issues: Issue[] = [];
  const connections = workspace.connections;
  let issueSeq = 0;
  const nextId = (type: string, processId: string, artifactId?: string) =>
    `issue-${type}-${processId}-${artifactId ?? "p"}-${issueSeq++}`;

  // Collect all outputs for similarity suggestions
  const allOutputs: {
    processId: string;
    processName: string;
    outputId: string;
    name: string;
  }[] = [];
  for (const p of workspace.processes) {
    for (const o of p.outputs) {
      allOutputs.push({
        processId: p.id,
        processName: p.name,
        outputId: o.id,
        name: o.name,
      });
    }
  }

  let totalLinkedInputs = 0;
  let totalInputs = 0;
  let totalConsumedOutputs = 0;
  let totalOutputs = 0;
  let completenessSum = 0;

  for (const p of workspace.processes) {
    const completeness = computeCompleteness(p, connections);
    completenessSum += completeness;

    // Incomplete SIPOC
    if (!p.name.trim() || p.steps.filter((s) => s.trim()).length === 0) {
      issues.push({
        id: nextId("incomplete_sipoc", p.id),
        type: "incomplete_sipoc",
        severity: "high",
        processId: p.id,
        message: `Process "${p.name || "Untitled"}" is missing a name or process steps`,
        suggestion: "Add a clear name and 5–7 chronological steps",
        action: "edit",
      });
    }

    const stepCount = p.steps.filter((s) => s.trim()).length;
    if (stepCount > 0 && (stepCount < 5 || stepCount > 7)) {
      issues.push({
        id: nextId("step_count", p.id),
        type: "step_count",
        severity: "low",
        processId: p.id,
        message: `"${p.name}" has ${stepCount} steps (SIPOC typically uses 5–7)`,
        suggestion:
          stepCount < 5
            ? "Consider breaking down or adding missing steps"
            : "Consider consolidating into higher-level steps",
        action: "add_steps",
      });
    }

    if (p.suppliers.length === 0) {
      issues.push({
        id: nextId("missing_section", p.id, "suppliers"),
        type: "missing_section",
        severity: "medium",
        processId: p.id,
        message: `"${p.name}" has no suppliers defined`,
        suggestion: "Add at least one supplier (external, team, or system)",
        action: "add_supplier",
      });
    }
    if (p.inputs.length === 0) {
      issues.push({
        id: nextId("missing_section", p.id, "inputs"),
        type: "missing_section",
        severity: "medium",
        processId: p.id,
        message: `"${p.name}" has no inputs defined`,
        action: "edit",
      });
    }
    if (p.outputs.length === 0) {
      issues.push({
        id: nextId("missing_section", p.id, "outputs"),
        type: "missing_section",
        severity: "medium",
        processId: p.id,
        message: `"${p.name}" has no outputs defined`,
        action: "edit",
      });
    }
    if (p.customers.length === 0) {
      issues.push({
        id: nextId("missing_section", p.id, "customers"),
        type: "missing_section",
        severity: "medium",
        processId: p.id,
        message: `"${p.name}" has no customers defined`,
        suggestion: "Add customers who receive the outputs",
        action: "add_customer",
      });
    }

    // Per-input holes
    for (const inp of p.inputs) {
      totalInputs++;
      const hasLink = connections.some(
        (c) => c.toProcessId === p.id && c.toInputId === inp.id,
      );
      const hasSource = !!inp.source || hasLink;
      if (hasSource) totalLinkedInputs++;

      if (!hasSource) {
        issues.push({
          id: nextId("missing_source", p.id, inp.id),
          type: "missing_source",
          severity: "high",
          processId: p.id,
          artifactId: inp.id,
          message: `Input "${inp.name}" in "${p.name}" has no source`,
          suggestion: "Link to an upstream output or assign an external supplier",
          action: "link",
        });

        // Similarity suggestions
        let best: (typeof allOutputs)[0] | null = null;
        let bestScore = 0.45;
        for (const o of allOutputs) {
          if (o.processId === p.id) continue;
          // skip if already connected from this output
          const already = connections.some(
            (c) =>
              c.fromProcessId === o.processId &&
              c.fromOutputId === o.outputId &&
              c.toProcessId === p.id &&
              c.toInputId === inp.id,
          );
          if (already) continue;
          const sim = nameSimilarity(inp.name, o.name);
          if (sim > bestScore) {
            bestScore = sim;
            best = o;
          }
        }
        if (best) {
          issues.push({
            id: nextId("suggestion_link", p.id, inp.id),
            type: "suggestion_link",
            severity: "low",
            processId: p.id,
            artifactId: inp.id,
            message: `Input "${inp.name}" may match Output "${best.name}" from "${best.processName}"`,
            suggestion: `Link "${best.processName}" → "${p.name}" via this I/O pair`,
            action: "link",
          });
        }
      }
    }

    // Per-output holes
    for (const outp of p.outputs) {
      totalOutputs++;
      const hasLink = connections.some(
        (c) => c.fromProcessId === p.id && c.fromOutputId === outp.id,
      );
      const hasDest = !!outp.destination || hasLink;
      if (hasDest) totalConsumedOutputs++;

      if (!hasDest) {
        issues.push({
          id: nextId("missing_destination", p.id, outp.id),
          type: "missing_destination",
          severity: "high",
          processId: p.id,
          artifactId: outp.id,
          message: `Output "${outp.name}" in "${p.name}" has no destination`,
          suggestion:
            "Link to a downstream input or assign an external customer",
          action: "link",
        });
      }
    }

    // Isolated processes
    const degree = getNodeDegree(p.id, connections);
    if (
      degree.in === 0 &&
      degree.out === 0 &&
      workspace.processes.length > 1
    ) {
      issues.push({
        id: nextId("isolated_process", p.id),
        type: "isolated_process",
        severity: "medium",
        processId: p.id,
        message: `"${p.name}" has no connections to other processes`,
        suggestion: "Connect inputs/outputs to related processes on the map",
        action: "link",
      });
    }
  }

  // Cycle awareness (informational)
  const cycleIds = findCycleProcessIds(connections);
  if (cycleIds.size > 0) {
    for (const pid of cycleIds) {
      const p = workspace.processes.find((x) => x.id === pid);
      if (!p) continue;
      issues.push({
        id: nextId("incomplete_sipoc", pid, "cycle"),
        type: "incomplete_sipoc",
        severity: "low",
        processId: pid,
        message: `"${p.name}" appears in a circular dependency chain`,
        suggestion: "Review whether the cycle is intentional feedback",
        action: "edit",
      });
    }
  }

  const byType: Record<string, number> = {};
  for (const i of issues) {
    byType[i.type] = (byType[i.type] ?? 0) + 1;
  }

  const linkedInputsPct =
    totalInputs === 0 ? 100 : Math.round((totalLinkedInputs / totalInputs) * 100);
  const consumedOutputsPct =
    totalOutputs === 0
      ? 100
      : Math.round((totalConsumedOutputs / totalOutputs) * 100);
  const connectivityScore = Math.round(
    (linkedInputsPct + consumedOutputsPct) / 2,
  );
  const avgCompleteness =
    workspace.processes.length === 0
      ? 0
      : Math.round(completenessSum / workspace.processes.length);

  const holeCount = issues.filter(
    (i) =>
      i.type === "missing_source" ||
      i.type === "missing_destination" ||
      i.type === "isolated_process" ||
      i.type === "incomplete_sipoc",
  ).length;

  return {
    issues,
    stats: {
      totalProcesses: workspace.processes.length,
      avgCompleteness,
      holeCount,
      connectivityScore,
      linkedInputsPct,
      consumedOutputsPct,
      byType,
    },
  };
}

/** Issues for a single process */
export function issuesForProcess(
  workspace: Workspace,
  processId: string,
): Issue[] {
  return analyzeWorkspace(workspace).issues.filter(
    (i) => i.processId === processId,
  );
}
