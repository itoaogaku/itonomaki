import { NextResponse } from "next/server";
import { requireEditAuth } from "@/lib/editAuth";
import { getFile } from "@/lib/github";
import { SECTION_ORDER } from "@/lib/content";

export async function GET(request: Request) {
  if (!(await requireEditAuth())) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section") ?? "";
  const topic = searchParams.get("topic")?.trim() ?? "";

  if (!SECTION_ORDER.includes(section) || !topic) {
    return NextResponse.json({ error: "不正なパラメータです" }, { status: 400 });
  }

  try {
    const file = await getFile(section, topic);
    if (!file) {
      return NextResponse.json({ error: "トピックが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ content: file.content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
