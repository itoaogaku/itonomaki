import { NextResponse } from "next/server";
import { requireEditAuth } from "@/lib/editAuth";
import { rotateImage } from "@/lib/ftpImages";

export async function POST(request: Request) {
  if (!(await requireEditAuth())) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url) {
    return NextResponse.json({ error: "画像URLが必要です" }, { status: 400 });
  }

  try {
    const rotatedUrl = await rotateImage(url);
    return NextResponse.json({ url: rotatedUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
