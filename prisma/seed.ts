import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/server/auth";
import { OU_IDS } from "../lib/ouIds";

const prisma = new PrismaClient();

const DEFAULT_ORG_ID = "default-org";

async function main() {
  const adminHash = await hashPassword("admin123");
  const editorHash = await hashPassword("editor123");
  const viewerHash = await hashPassword("viewer123");

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    create: {
      email: "admin@example.com",
      name: "Admin User",
      passwordHash: adminHash,
      isSystemAdmin: true,
    },
    update: {},
  });

  const editor = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    create: {
      email: "editor@example.com",
      name: "Editor User",
      passwordHash: editorHash,
    },
    update: {},
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@example.com" },
    create: {
      email: "viewer@example.com",
      name: "Viewer User",
      passwordHash: viewerHash,
    },
    update: {},
  });

  await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    create: {
      id: DEFAULT_ORG_ID,
      name: "Healthcare TPA",
      slug: "healthcare-tpa",
    },
    update: {},
  });

  const units = [
    { id: OU_IDS.sales, name: "Sales Ops", slug: "sales-ops", description: "Group sales and employer onboarding" },
    { id: OU_IDS.enrollment, name: "Enrollment Ops", slug: "enrollment-ops", description: "Member enrollment and eligibility" },
    { id: OU_IDS.fulfillment, name: "Fulfillment", slug: "fulfillment", description: "ID card production and member materials" },
    { id: OU_IDS.platform, name: "Benefits Platform", slug: "benefits-platform", description: "Core benefits administration platform" },
    { id: OU_IDS.claims, name: "Claims Operations", slug: "claims-ops", description: "Claims adjudication and payment" },
    { id: OU_IDS.data, name: "Data Engineering", slug: "data-engineering", description: "Data vault and analytics feeds" },
  ];

  for (const unit of units) {
    await prisma.organizationalUnit.upsert({
      where: { id: unit.id },
      create: {
        ...unit,
        organizationId: DEFAULT_ORG_ID,
      },
      update: {
        name: unit.name,
        slug: unit.slug,
        description: unit.description,
      },
    });
  }

  await prisma.userOuMembership.deleteMany({ where: { orgId: DEFAULT_ORG_ID } });

  const memberships = [
    ...units.map((u) => ({ userId: admin.id, ouId: u.id, role: "admin" as const, orgId: DEFAULT_ORG_ID })),
    { userId: editor.id, ouId: OU_IDS.enrollment, role: "editor" as const, orgId: DEFAULT_ORG_ID },
    { userId: editor.id, ouId: OU_IDS.claims, role: "editor" as const, orgId: DEFAULT_ORG_ID },
    { userId: editor.id, ouId: OU_IDS.platform, role: "viewer" as const, orgId: DEFAULT_ORG_ID },
    { userId: viewer.id, ouId: OU_IDS.sales, role: "viewer" as const, orgId: DEFAULT_ORG_ID },
    { userId: viewer.id, ouId: OU_IDS.enrollment, role: "viewer" as const, orgId: DEFAULT_ORG_ID },
  ];

  await prisma.userOuMembership.createMany({ data: memberships });

  console.log("Seed complete:", { users: 3, ous: units.length, memberships: memberships.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
