import { newId, nowIso } from "./ids";
import { DEFAULT_WORKSPACE_ID } from "./syncTypes";
import type { Connection, Process, ProcessStep, Workspace } from "./types";
import { SCHEMA_VERSION } from "./types";

function steps(...texts: string[]): ProcessStep[] {
  return texts.map((text) => ({ id: newId(), text }));
}

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

/**
 * Healthcare Benefits TPA sample with hierarchy:
 * Sales → Member Enrollment → ID Card Production
 * plus peer I/O chain Enrollment → Eligibility → Claims
 */
export function createSampleWorkspace(): Workspace {
  const now = nowIso();

  const salesId = newId();
  const enrollmentId = newId();
  const eligibilityId = newId();
  const claimsId = newId();
  const idCardId = newId();
  const dataVaultId = newId();

  const outMemberRecord = newId();
  const outWelcome = newId();
  const outIdCardReq = newId();
  const outEligResult = newId();
  const outEligFeed = newId();
  const outClaimDecision = newId();
  const outEob = newId();
  const outVaultSync = newId();
  const outSoldGroup = newId();

  const inEligData = newId();
  const inEnrollmentForm = newId();
  const inMemberRecordElig = newId();
  const inClaimFile = newId();
  const inEligForClaims = newId();
  const inIdCardReq = newId();
  const inMemberForCard = newId();
  const inVaultPayload = newId();
  const inCensus = newId();

  // Step IDs we need to wire to subprocesses
  const salesStepEnroll = newId();
  const enrollStepIdCards = newId();

  const processes: Process[] = [
    makeProcess({
      id: salesId,
      name: "Group Sales & Onboarding",
      description:
        "High-level sales-to-onboarding process for new employer groups. Step “Enroll Employer Members” drills into the Member Enrollment SIPOC.",
      tags: ["sales", "enrollment"],
      owner: "Sales Ops",
      position: { x: 200, y: 160 },
      steps: [
        { id: newId(), text: "Qualify employer group opportunity" },
        { id: newId(), text: "Configure plan offerings & rates" },
        { id: newId(), text: "Close group contract" },
        {
          id: salesStepEnroll,
          text: "Enroll Employer Members",
          subprocessId: enrollmentId,
        },
        { id: newId(), text: "Confirm go-live & handoff to account management" },
      ],
      suppliers: [
        { id: newId(), name: "Brokers", type: "external" },
        { id: newId(), name: "Employer groups", type: "external" },
      ],
      inputs: [
        {
          id: inCensus,
          name: "Group census / RFP",
          source: { type: "supplier" },
        },
      ],
      outputs: [
        {
          id: outSoldGroup,
          name: "Sold group package",
          destination: { type: "customer" },
        },
      ],
      customers: [
        { id: newId(), name: "Employer group", type: "external" },
        {
          id: newId(),
          name: "New Member Enrollment",
          type: "process",
          processId: enrollmentId,
        },
      ],
    }),
    makeProcess({
      id: enrollmentId,
      name: "New Member Enrollment",
      description:
        "Receive and process new member applications. Child of Group Sales; “Send ID Cards” drills into ID Card Production.",
      tags: ["enrollment", "compliance"],
      owner: "Enrollment Ops",
      parentProcessId: salesId,
      position: { x: 80, y: 180 },
      steps: [
        { id: newId(), text: "Receive application package" },
        { id: newId(), text: "Validate demographics & coverage elections" },
        { id: newId(), text: "Check waiting periods / effective dates" },
        { id: newId(), text: "Create member record in core system" },
        { id: newId(), text: "Generate welcome materials" },
        {
          id: enrollStepIdCards,
          text: "Send ID Cards",
          subprocessId: idCardId,
        },
        { id: newId(), text: "Notify eligibility engine" },
      ],
      suppliers: [
        { id: newId(), name: "Employer Groups", type: "external" },
        { id: newId(), name: "Brokers", type: "external" },
        { id: newId(), name: "Salesforce CRM", type: "system" },
        {
          id: newId(),
          name: "Group Sales & Onboarding",
          type: "process",
          processId: salesId,
        },
      ],
      inputs: [
        {
          id: inEnrollmentForm,
          name: "Enrollment forms",
          description: "Paper/electronic applications",
          source: { type: "supplier" },
        },
        {
          id: inEligData,
          name: "Eligibility data feed",
          description: "Census / eligibility roster from groups",
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
      id: idCardId,
      name: "ID Card Production",
      description:
        "Produce and mail member ID cards. Child of Member Enrollment (step: Send ID Cards).",
      tags: ["enrollment"],
      owner: "Fulfillment",
      parentProcessId: enrollmentId,
      position: { x: 120, y: 200 },
      steps: steps(
        "Receive ID card request",
        "Validate member demographics",
        "Compose card artwork",
        "Print & quality check",
        "Mail to member",
      ),
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
        { id: inIdCardReq, name: "ID card request" },
        { id: inMemberForCard, name: "Member demographics" },
      ],
      outputs: [
        {
          id: newId(),
          name: "Physical ID card",
          destination: { type: "customer" },
        },
        { id: newId(), name: "Card mailed confirmation" },
      ],
      customers: [{ id: newId(), name: "Member", type: "external" }],
    }),
    makeProcess({
      id: eligibilityId,
      name: "Eligibility Verification Engine",
      description:
        "Maintains member eligibility state and answers inquiries for claims and service channels.",
      tags: ["eligibility", "data"],
      owner: "Benefits Platform",
      position: { x: 520, y: 80 },
      steps: steps(
        "Ingest member activations & terminations",
        "Normalize plan & coverage rules",
        "Update eligibility ledger",
        "Respond to eligibility inquiries",
        "Publish eligibility snapshots",
      ),
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
        { id: newId(), name: "Termination notices" },
      ],
      outputs: [
        { id: outEligResult, name: "Eligibility determination" },
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
        "Receive claims, verify eligibility, apply benefits, and produce remittance outcomes.",
      tags: ["claims", "compliance"],
      owner: "Claims Operations",
      position: { x: 900, y: 180 },
      steps: steps(
        "Receive & acknowledge claim files",
        "Validate claim completeness",
        "Verify member eligibility",
        "Apply plan benefits & accumulators",
        "Adjudicate & price claim",
        "Generate EOB / remittance",
        "Post financials",
      ),
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
        { id: inEligForClaims, name: "Eligibility determination" },
      ],
      outputs: [
        {
          id: outClaimDecision,
          name: "Claim decision",
          destination: { type: "customer" },
        },
        { id: outEob, name: "EOB / remittance advice" },
      ],
      customers: [
        { id: newId(), name: "Provider", type: "external" },
        { id: newId(), name: "Member", type: "external" },
        { id: newId(), name: "Finance", type: "internal" },
      ],
    }),
    makeProcess({
      id: dataVaultId,
      name: "Data Vault Sync",
      description:
        "Nightly sync of operational data into the analytics data vault.",
      tags: ["data"],
      owner: "Data Engineering",
      position: { x: 900, y: 400 },
      steps: steps(
        "Extract operational tables",
        "Transform to vault hubs/links/sats",
        "Load staging",
        "Publish marts",
      ),
      suppliers: [{ id: newId(), name: "Core admin DB", type: "system" }],
      inputs: [{ id: inVaultPayload, name: "Operational extract" }],
      outputs: [{ id: outVaultSync, name: "Analytics snapshot" }],
      customers: [{ id: newId(), name: "BI / Analytics", type: "internal" }],
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
    id: DEFAULT_WORKSPACE_ID,
    name: "Healthcare Benefits TPA",
    description:
      "Sample with process hierarchy (Sales → Enrollment → ID Cards) plus peer I/O links and intentional gaps.",
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
    id: DEFAULT_WORKSPACE_ID,
    name,
    description: "",
    schemaVersion: SCHEMA_VERSION,
    processes: [],
    connections: [],
    createdAt: now,
    updatedAt: now,
  };
}
