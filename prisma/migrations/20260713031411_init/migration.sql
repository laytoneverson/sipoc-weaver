-- CreateEnum
CREATE TYPE "OuRole" AS ENUM ('viewer', 'editor', 'admin');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationalUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentOuId" TEXT,
    "description" TEXT,

    CONSTRAINT "OrganizationalUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOuMembership" (
    "userId" TEXT NOT NULL,
    "ouId" TEXT NOT NULL,
    "role" "OuRole" NOT NULL,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "UserOuMembership_pkey" PRIMARY KEY ("userId","ouId")
);

-- CreateTable
CREATE TABLE "WorkspaceRecord" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspace" JSONB NOT NULL,

    CONSTRAINT "WorkspaceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationalUnit_organizationId_idx" ON "OrganizationalUnit"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationalUnit_organizationId_slug_key" ON "OrganizationalUnit"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "UserOuMembership_orgId_idx" ON "UserOuMembership"("orgId");

-- CreateIndex
CREATE INDEX "UserOuMembership_ouId_idx" ON "UserOuMembership"("ouId");

-- AddForeignKey
ALTER TABLE "OrganizationalUnit" ADD CONSTRAINT "OrganizationalUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOuMembership" ADD CONSTRAINT "UserOuMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOuMembership" ADD CONSTRAINT "UserOuMembership_ouId_fkey" FOREIGN KEY ("ouId") REFERENCES "OrganizationalUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOuMembership" ADD CONSTRAINT "UserOuMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
