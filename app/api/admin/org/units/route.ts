import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/server/adminAuth";
import {
  createOrganizationalUnit,
  readOrganization,
} from "@/lib/server/orgRepo";
import { ensureSeedData } from "@/lib/server/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const org = await readOrganization();
    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      organizationalUnits: org.organizationalUnits,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list units";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      parentOuId?: string;
    };

    if (!body.name || !body.slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 },
      );
    }

    const org = await createOrganizationalUnit(auth.org.id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentOuId: body.parentOuId,
    });

    return NextResponse.json({
      organizationalUnits: org.organizationalUnits,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create unit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
