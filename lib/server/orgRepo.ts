import type {
  Organization,
  OrganizationalUnit,
  OuRole,
  UserOuMembership,
} from "@/lib/orgTypes";
import { prisma } from "@/lib/server/db";
import { newId, nowIso } from "@/lib/ids";

function toOrganization(
  org: {
    id: string;
    name: string;
    slug: string;
    updatedAt: Date;
    units: Array<{
      id: string;
      name: string;
      slug: string;
      parentOuId: string | null;
      description: string | null;
    }>;
    memberships: Array<{
      userId: string;
      ouId: string;
      role: OuRole;
    }>;
  },
): Organization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    updatedAt: org.updatedAt.toISOString(),
    organizationalUnits: org.units.map((u) => ({
      id: u.id,
      name: u.name,
      slug: u.slug,
      parentOuId: u.parentOuId ?? undefined,
      description: u.description ?? undefined,
    })),
    memberships: org.memberships.map((m) => ({
      userId: m.userId,
      ouId: m.ouId,
      role: m.role,
    })),
  };
}

async function loadOrg(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      units: { orderBy: { name: "asc" } },
      memberships: true,
    },
  });
}

export async function readOrganization(
  orgId = "default-org",
): Promise<Organization | null> {
  const row = await loadOrg(orgId);
  return row ? toOrganization(row) : null;
}

export async function writeOrganization(org: Organization): Promise<Organization> {
  await prisma.$transaction(async (tx) => {
    await tx.organization.upsert({
      where: { id: org.id },
      create: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      update: {
        name: org.name,
        slug: org.slug,
      },
    });

    const unitIds = org.organizationalUnits.map((u) => u.id);
    await tx.organizationalUnit.deleteMany({
      where: {
        organizationId: org.id,
        id: { notIn: unitIds.length ? unitIds : ["__none__"] },
      },
    });

    for (const unit of org.organizationalUnits) {
      await tx.organizationalUnit.upsert({
        where: { id: unit.id },
        create: {
          id: unit.id,
          organizationId: org.id,
          name: unit.name,
          slug: unit.slug,
          parentOuId: unit.parentOuId ?? null,
          description: unit.description ?? null,
        },
        update: {
          name: unit.name,
          slug: unit.slug,
          parentOuId: unit.parentOuId ?? null,
          description: unit.description ?? null,
        },
      });
    }

    await tx.userOuMembership.deleteMany({ where: { orgId: org.id } });
    if (org.memberships.length > 0) {
      await tx.userOuMembership.createMany({
        data: org.memberships.map((m) => ({
          userId: m.userId,
          ouId: m.ouId,
          role: m.role,
          orgId: org.id,
        })),
      });
    }
  });

  const saved = await readOrganization(org.id);
  if (!saved) throw new Error("Failed to save organization");
  return saved;
}

export async function updateMemberships(
  memberships: UserOuMembership[],
  orgId = "default-org",
): Promise<Organization> {
  const org = await readOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  return writeOrganization({ ...org, memberships, updatedAt: nowIso() });
}

export async function createOrganizationalUnit(
  orgId: string,
  input: Omit<OrganizationalUnit, "id"> & { id?: string },
): Promise<Organization> {
  const org = await readOrganization(orgId);
  if (!org) throw new Error("Organization not found");

  const unit: OrganizationalUnit = {
    id: input.id ?? newId(),
    name: input.name,
    slug: input.slug,
    parentOuId: input.parentOuId,
    description: input.description,
  };

  return writeOrganization({
    ...org,
    organizationalUnits: [...org.organizationalUnits, unit],
    updatedAt: nowIso(),
  });
}

export async function updateOrganizationalUnit(
  orgId: string,
  ouId: string,
  patch: Partial<Pick<OrganizationalUnit, "name" | "slug" | "parentOuId" | "description">>,
): Promise<Organization> {
  const org = await readOrganization(orgId);
  if (!org) throw new Error("Organization not found");

  const units = org.organizationalUnits.map((u) =>
    u.id === ouId ? { ...u, ...patch } : u,
  );
  return writeOrganization({ ...org, organizationalUnits: units, updatedAt: nowIso() });
}

export async function deleteOrganizationalUnit(
  orgId: string,
  ouId: string,
): Promise<Organization> {
  const org = await readOrganization(orgId);
  if (!org) throw new Error("Organization not found");

  const units = org.organizationalUnits.filter((u) => u.id !== ouId);
  const memberships = org.memberships.filter((m) => m.ouId !== ouId);
  return writeOrganization({
    ...org,
    organizationalUnits: units,
    memberships,
    updatedAt: nowIso(),
  });
}
