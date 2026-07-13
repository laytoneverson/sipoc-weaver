import type { Organization } from "@/lib/orgTypes";
import { getRoleForOu, hasMinRole } from "@/lib/server/permissions";
import { getSessionUser } from "@/lib/server/auth";
import { getUserById } from "@/lib/server/userRepo";
import { readOrganization } from "@/lib/server/orgRepo";

export function isOrgAdmin(
  org: Organization,
  userId: string,
  isSystemAdmin = false,
): boolean {
  if (isSystemAdmin) return true;
  return org.organizationalUnits.some((ou) =>
    hasMinRole(getRoleForOu(org, userId, ou.id), "admin"),
  );
}

export async function requireOrgAdmin(
  cookieHeader: string | null,
): Promise<
  | {
      ok: true;
      user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
      org: Organization;
    }
  | { ok: false; status: number; error: string }
> {
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const org = await readOrganization();
  if (!org) {
    return { ok: false, status: 500, error: "Organization not configured" };
  }

  const record = await getUserById(user.id);
  if (!record || !isOrgAdmin(org, user.id, record.isSystemAdmin)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user, org };
}
