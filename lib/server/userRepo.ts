import type { OuRole, UserRecord } from "@/lib/orgTypes";
import { hashPassword } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

function toUserRecord(row: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isSystemAdmin: boolean;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    isSystemAdmin: row.isSystemAdmin,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  const rows = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return rows.map(toUserRecord);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? toUserRecord(row) : null;
}

export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const row = await prisma.user.findUnique({ where: { email: normalized } });
  return row ? toUserRecord(row) : null;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  isSystemAdmin?: boolean;
}): Promise<UserRecord> {
  const normalized = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new Error("Email already registered");

  const row = await prisma.user.create({
    data: {
      email: normalized,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      isSystemAdmin: input.isSystemAdmin ?? false,
    },
  });
  return toUserRecord(row);
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    email?: string;
    password?: string;
    isSystemAdmin?: boolean;
  },
): Promise<UserRecord> {
  const data: {
    name?: string;
    email?: string;
    passwordHash?: string;
    isSystemAdmin?: boolean;
  } = {};

  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.email !== undefined) data.email = patch.email.trim().toLowerCase();
  if (patch.password !== undefined) {
    data.passwordHash = await hashPassword(patch.password);
  }
  if (patch.isSystemAdmin !== undefined) data.isSystemAdmin = patch.isSystemAdmin;

  const row = await prisma.user.update({ where: { id }, data });
  return toUserRecord(row);
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

export async function upsertUsers(users: UserRecord[]): Promise<void> {
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: u.passwordHash,
        isSystemAdmin: u.isSystemAdmin ?? false,
        createdAt: new Date(u.createdAt),
      },
      update: {
        email: u.email,
        name: u.name,
        passwordHash: u.passwordHash,
        isSystemAdmin: u.isSystemAdmin ?? false,
      },
    });
  }
}

export type { OuRole };
