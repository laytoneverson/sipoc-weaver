import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { ensureSeedData } from "@/lib/server/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSeedData();
  const user = await getSessionUser(req.headers.get("cookie"));
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
