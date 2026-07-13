import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/server/adminAuth";
import { ensureSeedData } from "@/lib/server/seed";
import { createUser, listUsers } from "@/lib/server/userRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeedData();
    const auth = await requireOrgAdmin(req.headers.get("cookie"));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const users = await listUsers();
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isSystemAdmin: u.isSystemAdmin ?? false,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list users";
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
      email?: string;
      name?: string;
      password?: string;
      isSystemAdmin?: boolean;
    };

    if (!body.email || !body.name || !body.password) {
      return NextResponse.json(
        { error: "email, name, and password are required" },
        { status: 400 },
      );
    }

    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      isSystemAdmin: body.isSystemAdmin,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin ?? false,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
