import { z } from "zod";

/** Stable IDs for robust linking across renames */
export type ID = string;

export const SCHEMA_VERSION = 2;

export interface Supplier {
  id: ID;
  name: string;
  type: "external" | "internal" | "system" | "process";
  processId?: ID;
}

export interface Input {
  id: ID;
  name: string;
  description?: string;
  source?: {
    type: "supplier" | "linked_output";
    supplierId?: ID;
    processId?: ID;
    outputId?: ID;
  };
}

export interface Output {
  id: ID;
  name: string;
  description?: string;
  destination?: {
    type: "customer" | "linked_input";
    customerId?: ID;
    processId?: ID;
    inputId?: ID;
  };
}

export interface Customer {
  id: ID;
  name: string;
  type: "external" | "internal" | "system" | "process";
  processId?: ID;
}

/** Chronological process step; may drill into a child SIPOC */
export interface ProcessStep {
  id: ID;
  text: string;
  /** When set, this step is realized by another Process (typically a child) */
  subprocessId?: ID;
}

export interface Process {
  id: ID;
  name: string;
  description: string;
  tags: string[];
  owner?: string;
  steps: ProcessStep[];
  suppliers: Supplier[];
  inputs: Input[];
  outputs: Output[];
  customers: Customer[];
  /** Parent in the process hierarchy (null/undefined = top-level / L1) */
  parentProcessId?: ID;
  completenessScore?: number;
  position?: { x: number; y: number };
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: ID;
  fromProcessId: ID;
  fromOutputId: ID;
  toProcessId: ID;
  toInputId: ID;
  notes?: string;
  createdAt: string;
}

export interface Workspace {
  id: ID;
  name: string;
  description?: string;
  schemaVersion: number;
  processes: Process[];
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
  lastAnalyzedAt?: string;
}

export type IssueType =
  | "missing_source"
  | "missing_destination"
  | "incomplete_sipoc"
  | "isolated_process"
  | "step_count"
  | "suggestion_link"
  | "missing_section";

export type IssueSeverity = "high" | "medium" | "low";

export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  processId: ID;
  artifactId?: ID;
  message: string;
  suggestion?: string;
  action?: "link" | "edit" | "add_supplier" | "add_customer" | "add_steps";
}

export type ViewMode = "map" | "library" | "gaps";

export interface AnalysisResult {
  issues: Issue[];
  stats: {
    totalProcesses: number;
    avgCompleteness: number;
    holeCount: number;
    connectivityScore: number;
    linkedInputsPct: number;
    consumedOutputsPct: number;
    byType: Record<string, number>;
  };
}

// Zod schemas for validation / import
export const supplierSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(["external", "internal", "system", "process"]),
  processId: z.string().optional(),
});

export const inputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  source: z
    .object({
      type: z.enum(["supplier", "linked_output"]),
      supplierId: z.string().optional(),
      processId: z.string().optional(),
      outputId: z.string().optional(),
    })
    .optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  destination: z
    .object({
      type: z.enum(["customer", "linked_input"]),
      customerId: z.string().optional(),
      processId: z.string().optional(),
      inputId: z.string().optional(),
    })
    .optional(),
});

export const customerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(["external", "internal", "system", "process"]),
  processId: z.string().optional(),
});

export const processStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  subprocessId: z.string().optional(),
});

/** Accept structured steps or legacy string steps (pre-migrate) */
export const processStepLooseSchema = z.union([
  processStepSchema,
  z.string(),
]);

export const processSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  owner: z.string().optional(),
  steps: z.array(processStepLooseSchema),
  suppliers: z.array(supplierSchema),
  inputs: z.array(inputSchema),
  outputs: z.array(outputSchema),
  customers: z.array(customerSchema),
  parentProcessId: z.string().optional(),
  completenessScore: z.number().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const connectionSchema = z.object({
  id: z.string(),
  fromProcessId: z.string(),
  fromOutputId: z.string(),
  toProcessId: z.string(),
  toInputId: z.string(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  schemaVersion: z.number().default(SCHEMA_VERSION),
  processes: z.array(processSchema),
  connections: z.array(connectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAnalyzedAt: z.string().optional(),
});
