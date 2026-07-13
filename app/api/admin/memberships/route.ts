import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/server/adminAuth";
import { updateMemberships } from "@/lib/server/orgRepo";
import { ensureSeedData } from "@/lib/server/seed";
import type { UserOuMembership } from "@/lib/orgTypes";
import { userOuMembershipSchema } from "@/lib/orgTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as { memberships?: UserOuMembership[] };
    if (!Array.isArray(body.memberships)) {
      return NextResponse.json(
        { error: "memberships array required" },
        { status: 400 },
      );
    }

    const parsed = body.memberships.map((m) => userOuMembershipSchema.parse(m));
    const updated = await updateMemberships(parsed, auth.org.id);
    return NextResponse.json({ memberships: updated.memberships });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
