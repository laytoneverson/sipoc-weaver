import { tool } from "ai";
import { z } from "zod";
import type { Process } from "@/lib/types";
import {
  addConnection,
  addCustomer,
  addInput,
  addOutput,
  addProcess,
  addStep,
  addSupplier,
  createSubprocessFromStep,
  deleteProcess,
  removeConnection,
  setProcessParent,
  updateProcess,
} from "@/lib/workspaceOps";
import {
  analyze,
  filterAnalysis,
  getProcess,
  listProcessSummaries,
  loadWorkspace,
  mutateWorkspace,
  processIssues,
  workspaceSummary,
} from "@/lib/ai/workspaceMutate";

const partyType = z.enum(["external", "internal", "system", "process"]);

export const SIPOC_SYSTEM_PROMPT = `You are SIPOC Weaver's process-building assistant.
You help users define SIPOC processes (Suppliers, Inputs, Process steps, Outputs, Customers), link I/O across processes, and fix gaps.

Workflow:
1. Call get_workspace_summary and/or list_processes to see current state.
2. add_process (or update an existing process) with a clear name and description.
3. Add 5–7 steps with add_step.
4. Add suppliers, inputs, outputs, and customers with the granular tools.
5. Link related processes with add_connection when an output feeds another process's input.
6. Call analyze_workspace and fix high-severity holes; use suggest_links for name-similarity ideas.
7. Prefer granular tools over wholesale rewrites. Always use real IDs returned by tools.

Keep replies concise. After mutating, briefly say what changed.`;

export const sipocTools = {
  get_workspace_summary: tool({
    description:
      "Summarize the current SIPOC workspace: counts, completeness, and holes",
    inputSchema: z.object({}),
    execute: async () => {
      const { workspace, analysis } = await analyze();
      return workspaceSummary(workspace, analysis);
    },
  }),

  list_processes: tool({
    description:
      "List all processes with id, name, parent, SIPOC section counts, and completeness",
    inputSchema: z.object({}),
    execute: async () => {
      const { workspace } = await analyze();
      return listProcessSummaries(workspace);
    },
  }),

  get_process: tool({
    description: "Get one process's full SIPOC plus its gap-analysis issues",
    inputSchema: z.object({
      process_id: z.string().describe("Process ID"),
    }),
    execute: async ({ process_id }) => {
      const workspace = await loadWorkspace();
      const process = getProcess(workspace, process_id);
      if (!process) throw new Error(`Process not found: ${process_id}`);
      return {
        process,
        issues: processIssues(workspace, process_id),
      };
    },
  }),

  analyze_workspace: tool({
    description:
      "Run gap analysis across the workspace; optionally filter by severity or process",
    inputSchema: z.object({
      severity: z
        .enum(["high", "medium", "low"])
        .optional()
        .describe("Only return issues of this severity"),
      process_id: z
        .string()
        .optional()
        .describe("Only return issues for this process"),
    }),
    execute: async ({ severity, process_id }) => {
      const { analysis } = await analyze();
      return filterAnalysis(analysis, {
        severity,
        processId: process_id,
      });
    },
  }),

  suggest_links: tool({
    description:
      "Return name-similarity link suggestions (issues of type suggestion_link)",
    inputSchema: z.object({}),
    execute: async () => {
      const { analysis } = await analyze();
      return {
        suggestions: analysis.issues.filter(
          (i) => i.type === "suggestion_link",
        ),
      };
    },
  }),

  add_process: tool({
    description: "Create a new SIPOC process (default 5 placeholder steps)",
    inputSchema: z.object({
      name: z.string().describe("Process name"),
      description: z.string().optional().describe("Process description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      owner: z.string().optional().describe("Process owner"),
      parent_process_id: z
        .string()
        .optional()
        .describe("Parent process ID for hierarchy"),
    }),
    execute: async ({
      name,
      description,
      tags,
      owner,
      parent_process_id,
    }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addProcess(ws, {
          name,
          description,
          tags,
          owner,
          parentProcessId: parent_process_id,
        });
        return {
          workspace: created.workspace,
          result: created.processId,
        };
      });
      return {
        processId: result,
        process: result ? getProcess(document.workspace, result) : null,
      };
    },
  }),

  update_process: tool({
    description:
      "Update process metadata (name, description, owner, tags, parent)",
    inputSchema: z.object({
      process_id: z.string().describe("Process ID"),
      name: z.string().optional(),
      description: z.string().optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional(),
      parent_process_id: z
        .string()
        .nullable()
        .optional()
        .describe("Parent process ID; null clears parent"),
    }),
    execute: async ({
      process_id,
      name,
      description,
      owner,
      tags,
      parent_process_id,
    }) => {
      const { document } = await mutateWorkspace((ws) => {
        if (!getProcess(ws, process_id)) {
          throw new Error(`Process not found: ${process_id}`);
        }
        let next = ws;
        const patch: Partial<Process> = {};
        if (name !== undefined) patch.name = name;
        if (description !== undefined) patch.description = description;
        if (owner !== undefined) patch.owner = owner;
        if (tags !== undefined) patch.tags = tags;
        if (Object.keys(patch).length > 0) {
          next = updateProcess(next, process_id, patch);
        }
        if (parent_process_id !== undefined) {
          const parent =
            parent_process_id === null ? undefined : parent_process_id;
          const withParent = setProcessParent(next, process_id, parent);
          if (!withParent) {
            throw new Error("Would create hierarchy cycle");
          }
          next = withParent;
        }
        return { workspace: next };
      });
      return { process: getProcess(document.workspace, process_id) };
    },
  }),

  delete_process: tool({
    description:
      "Delete a process; promotes children, clears step links, drops connections",
    inputSchema: z.object({
      process_id: z.string().describe("Process ID"),
    }),
    execute: async ({ process_id }) => {
      const { document } = await mutateWorkspace((ws) => {
        if (!getProcess(ws, process_id)) {
          throw new Error(`Process not found: ${process_id}`);
        }
        return { workspace: deleteProcess(ws, process_id).workspace };
      });
      return {
        deleted: process_id,
        processCount: document.workspace.processes.length,
      };
    },
  }),

  add_step: tool({
    description: "Append a process step",
    inputSchema: z.object({
      process_id: z.string(),
      text: z.string().describe("Step text"),
    }),
    execute: async ({ process_id, text }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addStep(ws, process_id, text);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return {
        stepId: result,
        process: getProcess(document.workspace, process_id),
      };
    },
  }),

  add_supplier: tool({
    description: "Add a supplier to a process",
    inputSchema: z.object({
      process_id: z.string(),
      name: z.string(),
      type: partyType.optional().describe("Default: external"),
      linked_process_id: z
        .string()
        .optional()
        .describe("When type is process, the linked process id"),
    }),
    execute: async ({ process_id, name, type, linked_process_id }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addSupplier(
          ws,
          process_id,
          name,
          type ?? "external",
          linked_process_id,
        );
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return {
        supplierId: result,
        process: getProcess(document.workspace, process_id),
      };
    },
  }),

  add_input: tool({
    description: "Add an input to a process",
    inputSchema: z.object({
      process_id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
    execute: async ({ process_id, name, description }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addInput(ws, process_id, name, description);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return {
        inputId: result,
        process: getProcess(document.workspace, process_id),
      };
    },
  }),

  add_output: tool({
    description: "Add an output to a process",
    inputSchema: z.object({
      process_id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
    execute: async ({ process_id, name, description }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addOutput(ws, process_id, name, description);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return {
        outputId: result,
        process: getProcess(document.workspace, process_id),
      };
    },
  }),

  add_customer: tool({
    description: "Add a customer to a process",
    inputSchema: z.object({
      process_id: z.string(),
      name: z.string(),
      type: partyType.optional().describe("Default: external"),
      linked_process_id: z.string().optional(),
    }),
    execute: async ({ process_id, name, type, linked_process_id }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addCustomer(
          ws,
          process_id,
          name,
          type ?? "external",
          linked_process_id,
        );
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return {
        customerId: result,
        process: getProcess(document.workspace, process_id),
      };
    },
  }),

  add_connection: tool({
    description:
      "Link an output of one process to an input of another (value-flow edge)",
    inputSchema: z.object({
      from_process_id: z.string(),
      from_output_id: z.string(),
      to_process_id: z.string(),
      to_input_id: z.string(),
    }),
    execute: async ({
      from_process_id,
      from_output_id,
      to_process_id,
      to_input_id,
    }) => {
      const { result } = await mutateWorkspace((ws) => {
        const created = addConnection(
          ws,
          from_process_id,
          from_output_id,
          to_process_id,
          to_input_id,
        );
        if (!created) {
          throw new Error(
            "Could not add connection (duplicate, self-link, or invalid endpoints)",
          );
        }
        return {
          workspace: created.workspace,
          result: created.connectionId,
        };
      });
      return { connectionId: result };
    },
  }),

  remove_connection: tool({
    description: "Remove an I/O connection by id",
    inputSchema: z.object({
      connection_id: z.string(),
    }),
    execute: async ({ connection_id }) => {
      await mutateWorkspace((ws) => {
        if (!ws.connections.some((c) => c.id === connection_id)) {
          throw new Error(`Connection not found: ${connection_id}`);
        }
        return { workspace: removeConnection(ws, connection_id) };
      });
      return { removed: connection_id };
    },
  }),

  create_subprocess_from_step: tool({
    description:
      "Create a child process from a step and link the step to that subprocess",
    inputSchema: z.object({
      process_id: z.string().describe("Parent process ID"),
      step_id: z.string().describe("Step ID on the parent"),
      name: z
        .string()
        .optional()
        .describe("Child process name (defaults to step text)"),
    }),
    execute: async ({ process_id, step_id, name }) => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = createSubprocessFromStep(
          ws,
          process_id,
          step_id,
          name,
        );
        if (!created) {
          throw new Error("Parent process or step not found");
        }
        return {
          workspace: created.workspace,
          result: created.processId,
        };
      });
      return {
        processId: result,
        process: result ? getProcess(document.workspace, result) : null,
      };
    },
  }),
};
