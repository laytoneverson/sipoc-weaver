import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { newId, nowIso } from "@/lib/ids";
import type { UserRecord } from "@/lib/orgTypes";
import { userRecordSchema } from "@/lib/orgTypes";
import { hashPassword } from "@/lib/server/auth";

const DATA_DIR =
  process.env.SIPOC_AUTH_DIR ?? path.join(process.cwd(), "data", "auth");

const USERS_FILE = "users.json";

async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

type UsersDocument = {
  users: UserRecord[];
  updatedAt: string;
};

async function readUsersDoc(): Promise<UsersDocument> {
  await ensureDir();
  try {
    const raw = await readFile(path.join(DATA_DIR, USERS_FILE), "utf8");
    const parsed = JSON.parse(raw) as UsersDocument;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      updatedAt: parsed.updatedAt ?? nowIso(),
    };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { users: [], updatedAt: nowIso() };
    }
    throw e;
  }
}

async function writeUsersDoc(doc: UsersDocument): Promise<void> {
  await ensureDir();
  const target = path.join(DATA_DIR, USERS_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  const next = { ...doc, updatedAt: nowIso() };
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, target);
}

export async function listUsers(): Promise<UserRecord[]> {
  const doc = await readUsersDoc();
  return doc.users;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const doc = await readUsersDoc();
  return doc.users.find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const doc = await readUsersDoc();
  const normalized = email.trim().toLowerCase();
  return doc.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<UserRecord> {
  const doc = await readUsersDoc();
  const normalized = input.email.trim().toLowerCase();
  if (doc.users.some((u) => u.email.toLowerCase() === normalized)) {
    throw new Error("Email already registered");
  }
  const user: UserRecord = {
    id: newId(),
    email: normalized,
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    createdAt: nowIso(),
  };
  const parsed = userRecordSchema.safeParse(user);
  if (!parsed.success) throw new Error("Invalid user data");
  doc.users.push(user);
  await writeUsersDoc(doc);
  return user;
}

export async function upsertUsers(users: UserRecord[]): Promise<void> {
  const doc = await readUsersDoc();
  doc.users = users;
  await writeUsersDoc(doc);
}
