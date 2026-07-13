import { OWNER_TO_OU, OU_IDS } from "@/lib/ouIds";
import { newId } from "@/lib/ids";
import type { Organization, UserRecord } from "@/lib/orgTypes";
import { readOrganization, writeOrganization } from "@/lib/server/orgRepo";
import { createUser, listUsers } from "@/lib/server/userRepo";

const DEFAULT_ORG_ID = "default-org";

export const SEED_OUS = OU_IDS;

export async function ensureSeedData(): Promise<void> {
  await ensureSeedUsers();
  await ensureSeedOrganization();
}

async function ensureSeedUsers(): Promise<UserRecord[]> {
  const existing = await listUsers();
  if (existing.length > 0) return existing;

  const admin = await createUser({
    email: "admin@example.com",
    name: "Admin User",
    password: "admin123",
    isSystemAdmin: true,
  });
  const editor = await createUser({
    email: "editor@example.com",
    name: "Editor User",
    password: "editor123",
  });
  const viewer = await createUser({
    email: "viewer@example.com",
    name: "Viewer User",
    password: "viewer123",
  });

  return [admin, editor, viewer];
}

async function ensureSeedOrganization(): Promise<Organization> {
  const existing = await readOrganization();
  if (existing) return existing;

  const users = await listUsers();
  const admin = users.find((u) => u.email === "admin@example.com");
  const editor = users.find((u) => u.email === "editor@example.com");
  const viewer = users.find((u) => u.email === "viewer@example.com");

  const org: Organization = {
    id: DEFAULT_ORG_ID,
    name: "Healthcare TPA",
    slug: "healthcare-tpa",
    updatedAt: new Date().toISOString(),
    organizationalUnits: [
      {
        id: SEED_OUS.sales,
        name: "Sales Ops",
        slug: "sales-ops",
        description: "Group sales and employer onboarding",
      },
      {
        id: SEED_OUS.enrollment,
        name: "Enrollment Ops",
        slug: "enrollment-ops",
        description: "Member enrollment and eligibility",
      },
      {
        id: SEED_OUS.fulfillment,
        name: "Fulfillment",
        slug: "fulfillment",
        description: "ID card production and member materials",
      },
      {
        id: SEED_OUS.platform,
        name: "Benefits Platform",
        slug: "benefits-platform",
        description: "Core benefits administration platform",
      },
      {
        id: SEED_OUS.claims,
        name: "Claims Operations",
        slug: "claims-ops",
        description: "Claims adjudication and payment",
      },
      {
        id: SEED_OUS.data,
        name: "Data Engineering",
        slug: "data-engineering",
        description: "Data vault and analytics feeds",
      },
    ],
    memberships: [
      ...(admin
        ? [
            { userId: admin.id, ouId: SEED_OUS.sales, role: "admin" as const },
            { userId: admin.id, ouId: SEED_OUS.enrollment, role: "admin" as const },
            { userId: admin.id, ouId: SEED_OUS.fulfillment, role: "admin" as const },
            { userId: admin.id, ouId: SEED_OUS.platform, role: "admin" as const },
            { userId: admin.id, ouId: SEED_OUS.claims, role: "admin" as const },
            { userId: admin.id, ouId: SEED_OUS.data, role: "admin" as const },
          ]
        : []),
      ...(editor
        ? [
            { userId: editor.id, ouId: SEED_OUS.enrollment, role: "editor" as const },
            { userId: editor.id, ouId: SEED_OUS.claims, role: "editor" as const },
            { userId: editor.id, ouId: SEED_OUS.platform, role: "viewer" as const },
          ]
        : []),
      ...(viewer
        ? [
            { userId: viewer.id, ouId: SEED_OUS.sales, role: "viewer" as const },
            { userId: viewer.id, ouId: SEED_OUS.enrollment, role: "viewer" as const },
          ]
        : []),
    ],
  };

  return writeOrganization(org);
}

export function ownerLabelToOuId(owner?: string): string | undefined {
  if (!owner) return undefined;
  return OWNER_TO_OU[owner];
}

export function newDefaultOuId(): string {
  return newId();
}
