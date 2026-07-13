import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { nowIso } from "@/lib/ids";
import type { Organization, UserOuMembership } from "@/lib/orgTypes";
import { organizationSchema } from "@/lib/orgTypes";

const DATA_DIR =
  process.env.SIPOC_ORG_DIR ?? path.join(process.cwd(), "data", "org");

const ORG_FILE = "default.json";

async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

function orgPath(): string {
  return path.join(DATA_DIR, ORG_FILE);
}

export async function readOrganization(): Promise<Organization | null> {
  await ensureDir();
  try {
    const raw = await readFile(orgPath(), "utf8");
    const parsed = organizationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeOrganization(org: Organization): Promise<Organization> {
  await ensureDir();
  const next: Organization = {
    ...org,
    updatedAt: nowIso(),
  };
  const parsed = organizationSchema.safeParse(next);
  if (!parsed.success) throw new Error("Invalid organization data");
  const target = orgPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(parsed.data, null, 2), "utf8");
  await rename(tmp, target);
  return parsed.data;
}

export async function updateMemberships(
  memberships: UserOuMembership[],
): Promise<Organization> {
  const org = await readOrganization();
  if (!org) throw new Error("Organization not found");
  return writeOrganization({ ...org, memberships });
}
