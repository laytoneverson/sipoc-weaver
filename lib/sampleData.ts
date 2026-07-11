import { newId, nowIso } from "./ids";
import type { Connection, Process, Workspace } from "./types";
import { SCHEMA_VERSION } from "./types";

function makeProcess(
  partial: Omit<Process, "createdAt" | "updatedAt" | "completenessScore"> & {
    createdAt?: string;
    updatedAt?: string;
  },
): Process {
  const ts = nowIso();
  return {
    ...partial,
    createdAt: partial.createdAt ?? ts,
    updatedAt: partial.updatedAt ?? ts,
  };
}

/** Healthcare Benefits TPA sample with intentional holes for demos */
export function createSampleWorkspace(): Workspace {
  const now = nowIso();

  const enrollmentId = newId();
  const eligibilityId = newId();
  const claimsId = newId();
  const idCardId = newId();
  const dataVaultId = newId();

  // Shared I/O ids for linking
  const outMemberRecord = newId();
  const outWelcome = newId();
  const outIdCardReq = newId();
  const outEligResult = newId();
  const outEligFeed = newId();
  const outClaimDecision = newId();
  const outEob = newId();
  const outVaultSync = newId();

  const inEligData = newId();
  const inEnrollmentForm = newId();
  const inMemberRecordElig = newId();
  const inClaimFile = newId();
  const inEligForClaims = newId();
  const inIdCardReq = newId();
  const inMemberForCard = newId();
  const inVaultPayload = newId();

  const processes: Process[] = [
    makeProcess({
      id: enrollmentId,
      name: "New Member Enrollment",
      description:
        "Receive and process new member applications from employer groups and brokers, creating the member record and triggering downstream activation.",
      tags: ["enrollment", "compliance"],
      owner: "Enrollment Ops",
      position: { x: 80, y: 180 },
      steps: [
        "Receive application package",
        "Validate demographics & coverage elections",
        "Check waiting periods / effective dates",
        "Create member record in core system",
        "Generate welcome materials",
        "Request ID card production",
        "Notify eligibility engine",
      ],
      suppliers: [
        { id: newId(), name: "Employer Groups", type: "external" },
        { id: newId(), name: "Brokers", type: "external" },
        { id: newId(), name: "Salesforce CRM", type: "system" },
      ],
      inputs: [
        {
          id: inEnrollmentForm,
          name: "Enrollment forms",
          description: "Paper/electronic applications",
          source: { type: "supplier", supplierId: undefined },
        },
        {
          id: inEligData,
          name: "Eligibility data feed",
          description: "Census / eligibility roster from groups",
          // intentional hole — no source linked
        },
      ],
      outputs: [
        {
          id: outMemberRecord,
          name: "Member record",
          description: "Activated member in core admin system",
        },
        {
          id: outWelcome,
          name: "Welcome packet",
          destination: { type: "customer" },
        },
        {
          id: outIdCardReq,
          name: "ID card request",
        },
      ],
      customers: [
        { id: newId(), name: "Member", type: "external" },
        { id: newId(), name: "Planstin Ops", type: "internal" },
        {
          id: newId(),
          name: "Eligibility Verification Engine",
          type: "process",
          processId: eligibilityId,
        },
      ],
    }),
    makeProcess({
      id: eligibilityId,
      name: "Eligibility Verification Engine",
      description:
        "Maintains member eligibility state and answers real-time / batch eligibility inquiries for claims and service channels.",
      tags: ["eligibility", "data"],
      owner: "Benefits Platform",
      position: { x: 460, y: 80 },
      steps: [
        "Ingest member activations & terminations",
        "Normalize plan & coverage rules",
        "Update eligibility ledger",
        "Respond to eligibility inquiries",
        "Publish eligibility snapshots",
      ],
      suppliers: [
        {
          id: newId(),
          name: "New Member Enrollment",
          type: "process",
          processId: enrollmentId,
        },
        { id: newId(), name: "HRIS feeds", type: "system" },
      ],
      inputs: [
        {
          id: inMemberRecordElig,
          name: "Member record",
          description: "New/updated member from enrollment",
        },
        {
          id: newId(),
          name: "Termination notices",
          // hole
        },
      ],
      outputs: [
        {
          id: outEligResult,
          name: "Eligibility determination",
        },
        {
          id: outEligFeed,
          name: "Member eligibility data",
          description: "Batch eligibility file for downstream systems",
        },
      ],
      customers: [
        {
          id: newId(),
          name: "Claims Receipt & Adjudication",
          type: "process",
          processId: claimsId,
        },
        { id: newId(), name: "Member Services", type: "internal" },
      ],
    }),
    makeProcess({
      id: claimsId,
      name: "Claims Receipt & Adjudication",
      description:
        "Receive professional and institutional claims, verify eligibility, apply benefits, and produce remittance outcomes.",
      tags: ["claims", "compliance"],
      owner: "Claims Operations",
      position: { x: 860, y: 180 },
      steps: [
        "Receive & acknowledge claim files",
        "Validate claim completeness",
        "Verify member eligibility",
        "Apply plan benefits & accumulators",
        "Adjudicate & price claim",
        "Generate EOB / remittance",
        "Post financials",
      ],
      suppliers: [
        { id: newId(), name: "Providers / Clearinghouses", type: "external" },
        {
          id: newId(),
          name: "Eligibility Verification Engine",
          type: "process",
          processId: eligibilityId,
        },
      ],
      inputs: [
        {
          id: inClaimFile,
          name: "Claim file (837)",
          source: { type: "supplier" },
        },
        {
          id: inEligForClaims,
          name: "Eligibility determination",
        },
      ],
      outputs: [
        {
          id: outClaimDecision,
          name: "Claim decision",
          destination: { type: "customer" },
        },
        {
          id: outEob,
          name: "EOB / remittance advice",
          // intentional orphan output (partially)
        },
      ],
      customers: [
        { id: newId(), name: "Provider", type: "external" },
        { id: newId(), name: "Member", type: "external" },
        { id: newId(), name: "Finance", type: "internal" },
      ],
    }),
    makeProcess({
      id: idCardId,
      name: "ID Card Production",
      description:
        "Produce and mail member ID cards based on enrollment requests and demographic data.",
      tags: ["enrollment"],
      owner: "Fulfillment",
      position: { x: 460, y: 340 },
      steps: [
        "Receive ID card request",
        "Validate member demographics",
        "Compose card artwork",
        "Print & quality check",
        "Mail to member",
      ],
      suppliers: [
        {
          id: newId(),
          name: "New Member Enrollment",
          type: "process",
          processId: enrollmentId,
        },
        { id: newId(), name: "Card vendor", type: "external" },
      ],
      inputs: [
        {
          id: inIdCardReq,
          name: "ID card request",
        },
        {
          id: inMemberForCard,
          name: "Member demographics",
          // hole — similar to Member record
        },
      ],
      outputs: [
        {
          id: newId(),
          name: "Physical ID card",
          destination: { type: "customer" },
        },
        {
          id: newId(),
          name: "Card mailed confirmation",
          // hole
        },
      ],
      customers: [
        { id: newId(), name: "Member", type: "external" },
      ],
    }),
    makeProcess({
      id: dataVaultId,
      name: "Data Vault Sync",
      description:
        "Nightly sync of operational data into the analytics data vault for reporting and compliance extracts.",
      tags: ["data"],
      owner: "Data Engineering",
      position: { x: 860, y: 400 },
      steps: [
        "Extract operational tables",
        "Transform to vault hubs/links/sats",
        "Load staging",
        "Publish marts",
      ],
      // Intentionally sparse + isolated-ish to show holes
      suppliers: [{ id: newId(), name: "Core admin DB", type: "system" }],
      inputs: [
        {
          id: inVaultPayload,
          name: "Operational extract",
          // hole — could link from claim decision / member record
        },
      ],
      outputs: [
        {
          id: outVaultSync,
          name: "Analytics snapshot",
          // orphan
        },
      ],
      customers: [
        { id: newId(), name: "BI / Analytics", type: "internal" },
      ],
    }),
  ];

  const connections: Connection[] = [
    {
      id: newId(),
      fromProcessId: enrollmentId,
      fromOutputId: outMemberRecord,
      toProcessId: eligibilityId,
      toInputId: inMemberRecordElig,
      createdAt: now,
    },
    {
      id: newId(),
      fromProcessId: enrollmentId,
      fromOutputId: outIdCardReq,
      toProcessId: idCardId,
      toInputId: inIdCardReq,
      createdAt: now,
    },
    {
      id: newId(),
      fromProcessId: eligibilityId,
      fromOutputId: outEligResult,
      toProcessId: claimsId,
      toInputId: inEligForClaims,
      createdAt: now,
    },
  ];

  // Denormalize linked source/destination on connected I/Os
  const applyLinks = (ws: Workspace) => {
    for (const c of ws.connections) {
      const from = ws.processes.find((p) => p.id === c.fromProcessId);
      const to = ws.processes.find((p) => p.id === c.toProcessId);
      const out = from?.outputs.find((o) => o.id === c.fromOutputId);
      const inp = to?.inputs.find((i) => i.id === c.toInputId);
      if (out) {
        out.destination = {
          type: "linked_input",
          processId: c.toProcessId,
          inputId: c.toInputId,
        };
      }
      if (inp) {
        inp.source = {
          type: "linked_output",
          processId: c.fromProcessId,
          outputId: c.fromOutputId,
        };
      }
    }
  };

  const workspace: Workspace = {
    id: newId(),
    name: "Healthcare Benefits TPA",
    description:
      "Sample Planstin-style landscape: enrollment → eligibility → claims, plus ID cards and data vault. Includes intentional gaps for the Gaps dashboard.",
    schemaVersion: SCHEMA_VERSION,
    processes,
    connections,
    createdAt: now,
    updatedAt: now,
    lastAnalyzedAt: now,
  };

  applyLinks(workspace);
  return workspace;
}

export function createEmptyWorkspace(name = "My Workspace"): Workspace {
  const now = nowIso();
  return {
    id: newId(),
    name,
    description: "",
    schemaVersion: SCHEMA_VERSION,
    processes: [],
    connections: [],
    createdAt: now,
    updatedAt: now,
  };
}
