import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/server/adminAuth";
import {
  deleteOrganizationalUnit,
  updateOrganizationalUnit,
} from "@/lib/server/orgRepo";
import { ensureSeedData } from "@/lib/server/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      parentOuId?: string | null;
    };

    const org = await updateOrganizationalUnit(auth.org.id, id, {
      ...body,
      parentOuId: body.parentOuId === null ? undefined : body.parentOuId,
    });

    return NextResponse.json({
      organizationalUnits: org.organizationalUnits,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update unit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const org = await deleteOrganizationalUnit(auth.org.id, id);

    return NextResponse.json({
      organizationalUnits: org.organizationalUnits,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete unit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
