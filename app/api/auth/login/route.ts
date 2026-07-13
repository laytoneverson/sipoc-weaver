import { NextResponse } from "next/server";
import {
  createSessionToken,
  formatSetCookie,
  verifyPassword,
} from "@/lib/server/auth";
import { ensureSeedData } from "@/lib/server/seed";
import { getUserByEmail } from "@/lib/server/userRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeedData();
    const body = (await req.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const user = await getUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const token = createSessionToken(user.id);
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.headers.set("Set-Cookie", formatSetCookie(token));
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
