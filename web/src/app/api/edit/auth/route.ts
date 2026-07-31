import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkPassword, requireEditAuth, signToken, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/editAuth";

export async function GET() {
  return NextResponse.json({ authenticated: await requireEditAuth() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
