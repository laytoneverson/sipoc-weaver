#!/usr/bin/env node
/**
 * SIPOC Weaver MCP server — stdio transport for AI hosts (Cursor, Claude Desktop).
 * Logs go to stderr only; stdout is reserved for the MCP protocol.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  errorResult,
  filterAnalysis,
  getProcess,
  getWorkspaceId,
  jsonResult,
  listProcessSummaries,
  loadWorkspace,
  mutateWorkspace,
  processIssues,
  workspaceSummary,
} from "./workspaceService";

const partyType = z.enum(["external", "internal", "system", "process"]);

const server = new McpServer({
  name: "sipoc-weaver",
  version: "0.1.0",
});

async function tool<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(message);
  }
}

function textResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// —— Resources ——————————————————————————————————————————————————————————————

server.registerResource(
  "workspace",
  new ResourceTemplate("sipoc://workspace/{id}", {
    list: async () => {
      const id = getWorkspaceId();
      return {
        resources: [
          {
            uri: `sipoc://workspace/${id}`,
            name: `Workspace ${id}`,
            mimeType: "application/json",
            description: "Full SIPOC workspace JSON",
          },
        ],
      };
    },
  }),
  {
    description: "Full SIPOC workspace document",
    mimeType: "application/json",
  },
  async (uri, variables) => {
    const id = String(variables.id ?? "");
    const workspace = await loadWorkspace();
    if (id !== workspace.id && id !== getWorkspaceId()) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Workspace not found: ${id}`,
          },
        ],
      };
    }
    return textResource(uri.href, workspace);
  },
);

server.registerResource(
  "process",
  new ResourceTemplate("sipoc://process/{id}", {
    list: async () => {
      const workspace = await loadWorkspace();
      return {
        resources: workspace.processes.map((p) => ({
          uri: `sipoc://process/${p.id}`,
          name: p.name,
          mimeType: "application/json",
          description: `SIPOC process: ${p.name}`,
        })),
      };
    },
  }),
  {
    description: "Single SIPOC process JSON",
    mimeType: "application/json",
  },
  async (uri, variables) => {
    const processId = String(variables.id ?? "");
    const workspace = await loadWorkspace();
    const process = getProcess(workspace, processId);
    if (!process) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Process not found: ${processId}`,
          },
        ],
      };
    }
    return textResource(uri.href, process);
  },
);

// —— Prompt ————————————————————————————————————————————————————————————————

server.registerPrompt(
  "build_process",
  {
    title: "Build a SIPOC process",
    description:
      "Guide for creating a complete SIPOC process in the workspace via tools",
    argsSchema: {
      process_name: z
        .string()
        .optional()
        .describe("Name of the process to build"),
      context: z
        .string()
        .optional()
        .describe("Domain or business context for the process"),
    },
  },
  ({ process_name, context }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Build or refine a SIPOC process in SIPOC Weaver using the available tools.",
            process_name ? `Target process name: ${process_name}` : null,
            context ? `Context: ${context}` : null,
            "",
            "Workflow:",
            "1. Call get_workspace_summary and list_processes to see current state.",
            "2. add_process (or update an existing process) with a clear name and description.",
            "3. Add 5–7 steps with add_step.",
            "4. Add suppliers (add_supplier), inputs (add_input), outputs (add_output), and customers (add_customer).",
            "5. Link related processes with add_connection when an output feeds another process's input.",
            "6. Call analyze_workspace and fix high-severity holes; use suggest_links for name-similarity link ideas.",
            "7. Prefer granular tools over wholesale rewrites; return process and artifact IDs from tool results.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      },
    ],
  }),
);

// —— Tools ————————————————————————————————————————————————————————————————

server.registerTool(
  "get_workspace_summary",
  {
    description:
      "Summarize the current SIPOC workspace: counts, completeness, and holes",
  },
  async () =>
    tool(async () => {
      const { workspace, analysis } = await analyze();
      return jsonResult(workspaceSummary(workspace, analysis));
    }),
);

server.registerTool(
  "list_processes",
  {
    description:
      "List all processes with id, name, parent, SIPOC section counts, and completeness",
  },
  async () =>
    tool(async () => {
      const { workspace } = await analyze();
      return jsonResult(listProcessSummaries(workspace));
    }),
);

server.registerTool(
  "get_process",
  {
    description: "Get one process's full SIPOC plus its gap-analysis issues",
    inputSchema: {
      process_id: z.string().describe("Process ID"),
    },
  },
  async ({ process_id }) =>
    tool(async () => {
      const workspace = await loadWorkspace();
      const process = getProcess(workspace, process_id);
      if (!process) return errorResult(`Process not found: ${process_id}`);
      return jsonResult({
        process,
        issues: processIssues(workspace, process_id),
      });
    }),
);

server.registerTool(
  "analyze_workspace",
  {
    description:
      "Run gap analysis across the workspace; optionally filter by severity or process",
    inputSchema: {
      severity: z
        .enum(["high", "medium", "low"])
        .optional()
        .describe("Only return issues of this severity"),
      process_id: z
        .string()
        .optional()
        .describe("Only return issues for this process"),
    },
  },
  async ({ severity, process_id }) =>
    tool(async () => {
      const { analysis } = await analyze();
      return jsonResult(
        filterAnalysis(analysis, {
          severity,
          processId: process_id,
        }),
      );
    }),
);

server.registerTool(
  "suggest_links",
  {
    description:
      "Return name-similarity link suggestions (issues of type suggestion_link)",
  },
  async () =>
    tool(async () => {
      const { analysis } = await analyze();
      return jsonResult({
        suggestions: analysis.issues.filter(
          (i) => i.type === "suggestion_link",
        ),
      });
    }),
);

server.registerTool(
  "add_process",
  {
    description: "Create a new SIPOC process (default 5 placeholder steps)",
    inputSchema: {
      name: z.string().describe("Process name"),
      description: z.string().optional().describe("Process description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      owner: z.string().optional().describe("Process owner"),
      parent_process_id: z
        .string()
        .optional()
        .describe("Parent process ID for hierarchy"),
    },
  },
  async ({ name, description, tags, owner, parent_process_id }) =>
    tool(async () => {
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
      return jsonResult({
        processId: result,
        process: result ? getProcess(document.workspace, result) : null,
      });
    }),
);

server.registerTool(
  "update_process",
  {
    description:
      "Update process metadata (name, description, owner, tags, parent)",
    inputSchema: {
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
    },
  },
  async ({ process_id, name, description, owner, tags, parent_process_id }) =>
    tool(async () => {
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
      return jsonResult({
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "delete_process",
  {
    description:
      "Delete a process; promotes children, clears step links, drops connections",
    inputSchema: {
      process_id: z.string().describe("Process ID"),
    },
  },
  async ({ process_id }) =>
    tool(async () => {
      const { document } = await mutateWorkspace((ws) => {
        if (!getProcess(ws, process_id)) {
          throw new Error(`Process not found: ${process_id}`);
        }
        return { workspace: deleteProcess(ws, process_id).workspace };
      });
      return jsonResult({
        deleted: process_id,
        processCount: document.workspace.processes.length,
      });
    }),
);

server.registerTool(
  "add_step",
  {
    description: "Append a process step",
    inputSchema: {
      process_id: z.string(),
      text: z.string().describe("Step text"),
    },
  },
  async ({ process_id, text }) =>
    tool(async () => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addStep(ws, process_id, text);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return jsonResult({
        stepId: result,
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "add_supplier",
  {
    description: "Add a supplier to a process",
    inputSchema: {
      process_id: z.string(),
      name: z.string(),
      type: partyType.optional().describe("Default: external"),
      linked_process_id: z
        .string()
        .optional()
        .describe("When type is process, the linked process id"),
    },
  },
  async ({ process_id, name, type, linked_process_id }) =>
    tool(async () => {
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
      return jsonResult({
        supplierId: result,
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "add_input",
  {
    description: "Add an input to a process",
    inputSchema: {
      process_id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    },
  },
  async ({ process_id, name, description }) =>
    tool(async () => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addInput(ws, process_id, name, description);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return jsonResult({
        inputId: result,
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "add_output",
  {
    description: "Add an output to a process",
    inputSchema: {
      process_id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    },
  },
  async ({ process_id, name, description }) =>
    tool(async () => {
      const { document, result } = await mutateWorkspace((ws) => {
        const created = addOutput(ws, process_id, name, description);
        if (!created) throw new Error(`Process not found: ${process_id}`);
        return { workspace: created.workspace, result: created.entityId };
      });
      return jsonResult({
        outputId: result,
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "add_customer",
  {
    description: "Add a customer to a process",
    inputSchema: {
      process_id: z.string(),
      name: z.string(),
      type: partyType.optional().describe("Default: external"),
      linked_process_id: z.string().optional(),
    },
  },
  async ({ process_id, name, type, linked_process_id }) =>
    tool(async () => {
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
      return jsonResult({
        customerId: result,
        process: getProcess(document.workspace, process_id),
      });
    }),
);

server.registerTool(
  "add_connection",
  {
    description:
      "Link an output of one process to an input of another (value-flow edge)",
    inputSchema: {
      from_process_id: z.string(),
      from_output_id: z.string(),
      to_process_id: z.string(),
      to_input_id: z.string(),
    },
  },
  async ({
    from_process_id,
    from_output_id,
    to_process_id,
    to_input_id,
  }) =>
    tool(async () => {
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
      return jsonResult({ connectionId: result });
    }),
);

server.registerTool(
  "remove_connection",
  {
    description: "Remove an I/O connection by id",
    inputSchema: {
      connection_id: z.string(),
    },
  },
  async ({ connection_id }) =>
    tool(async () => {
      await mutateWorkspace((ws) => {
        if (!ws.connections.some((c) => c.id === connection_id)) {
          throw new Error(`Connection not found: ${connection_id}`);
        }
        return { workspace: removeConnection(ws, connection_id) };
      });
      return jsonResult({ removed: connection_id });
    }),
);

server.registerTool(
  "create_subprocess_from_step",
  {
    description:
      "Create a child process from a step and link the step to that subprocess",
    inputSchema: {
      process_id: z.string().describe("Parent process ID"),
      step_id: z.string().describe("Step ID on the parent"),
      name: z
        .string()
        .optional()
        .describe("Child process name (defaults to step text)"),
    },
  },
  async ({ process_id, step_id, name }) =>
    tool(async () => {
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
      return jsonResult({
        processId: result,
        process: result ? getProcess(document.workspace, result) : null,
      });
    }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `SIPOC Weaver MCP server running on stdio (workspace=${getWorkspaceId()})`,
  );
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
