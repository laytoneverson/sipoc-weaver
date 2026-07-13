import type { Connection, Process } from "@/lib/types";
import type { Organization, OrganizationalUnit, OuRole } from "@/lib/orgTypes";

export function findOu(
  org: Organization | null,
  ouId: string | undefined,
): OrganizationalUnit | undefined {
  if (!org || !ouId) return undefined;
  return org.organizationalUnits.find((ou) => ou.id === ouId);
}

export function ouName(
  org: Organization | null,
  ouId: string | undefined,
): string {
  return findOu(org, ouId)?.name ?? "Unassigned";
}

export function isCrossOuLink(
  from: Process | undefined,
  to: Process | undefined,
): boolean {
  if (!from?.ouId || !to?.ouId) return false;
  return from.ouId !== to.ouId;
}

export function connectionIsCrossOu(
  connection: Connection,
  processes: Process[],
): boolean {
  if (connection.crossOu !== undefined) return connection.crossOu;
  const from = processes.find((p) => p.id === connection.fromProcessId);
  const to = processes.find((p) => p.id === connection.toProcessId);
  return isCrossOuLink(from, to);
}

export function roleLabel(role: OuRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function userCanEditOu(
  org: Organization | null,
  userId: string | undefined,
  ouId: string | undefined,
): boolean {
  if (!org || !userId || !ouId) return false;
  const membership = org.memberships.find(
    (m) => m.userId === userId && m.ouId === ouId,
  );
  return membership?.role === "editor" || membership?.role === "admin";
}
