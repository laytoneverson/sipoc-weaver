import { z } from "zod";
import type { ID } from "@/lib/types";

export type OuRole = "viewer" | "editor" | "admin";

export interface UserRecord {
  id: ID;
  email: string;
  name: string;
  passwordHash: string;
  isSystemAdmin?: boolean;
  createdAt: string;
}

export interface SessionUser {
  id: ID;
  email: string;
  name: string;
}

export interface OrganizationalUnit {
  id: ID;
  name: string;
  slug: string;
  parentOuId?: ID;
  description?: string;
}

export interface UserOuMembership {
  userId: ID;
  ouId: ID;
  role: OuRole;
}

export interface Organization {
  id: ID;
  name: string;
  slug: string;
  organizationalUnits: OrganizationalUnit[];
  memberships: UserOuMembership[];
  updatedAt: string;
}

export interface OrgContextResponse {
  organization: Organization;
  users: Array<Pick<UserRecord, "id" | "email" | "name">>;
  accessibleOuIds: ID[];
  memberships: UserOuMembership[];
  isOrgAdmin: boolean;
}

export const ouRoleSchema = z.enum(["viewer", "editor", "admin"]);

export const organizationalUnitSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parentOuId: z.string().optional(),
  description: z.string().optional(),
});

export const userOuMembershipSchema = z.object({
  userId: z.string(),
  ouId: z.string(),
  role: ouRoleSchema,
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  organizationalUnits: z.array(organizationalUnitSchema),
  memberships: z.array(userOuMembershipSchema),
  updatedAt: z.string(),
});

export const userRecordSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  passwordHash: z.string(),
  isSystemAdmin: z.boolean().optional(),
  createdAt: z.string(),
});
