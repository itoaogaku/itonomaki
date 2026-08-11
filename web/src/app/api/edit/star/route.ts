import { NextResponse } from "next/server";
import { requireEditAuth } from "@/lib/editAuth";
import { getFileAtPath, putFileAtPath } from "@/lib/github";
import { SECTION_ORDER, starredKey } from "@/lib/content";

const STARRED_PATH = "notion_sync/starred.json";

export async function POST(request: Request) {
  if (!(await requireEditAuth())) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const section = typeof body?.section === "string" ? body.section : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const starred = Boolean(body?.starred);

  if (!SECTION_ORDER.includes(section) || !topic) {
    return NextResponse.json({ error: "不正なパラメータです" }, { status: 400 });
  }

  try {
    const file = await getFileAtPath(STARRED_PATH);
    const current: string[] = file ? JSON.parse(file.content) : [];
    const key = starredKey(section, topic);
    const next = starred ? Array.from(new Set([...current, key])) : current.filter((k) => k !== key);
    next.sort();

    await putFileAtPath(
      STARRED_PATH,
      JSON.stringify(next, null, 2) + "\n",
      file?.sha ?? null,
      starred ? `Star ${key}` : `Unstar ${key}`
    );
    return NextResponse.json({ ok: true, starred });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
