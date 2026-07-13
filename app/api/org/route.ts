import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { readOrganization } from "@/lib/server/orgRepo";
import { accessibleOuIds } from "@/lib/server/permissions";
import { ensureSeedData } from "@/lib/server/seed";
import { listUsers } from "@/lib/server/userRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeedData();
    const user = await getSessionUser(req.headers.get("cookie"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await readOrganization();
    if (!organization) {
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 500 },
      );
    }

    const users = await listUsers();
    const memberships = organization.memberships.filter(
      (m) => m.userId === user.id,
    );

    return NextResponse.json({
      organization,
      users: users.map((u) => ({ id: u.id, email: u.email, name: u.name })),
      accessibleOuIds: accessibleOuIds(organization, user.id),
      memberships,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load org";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
