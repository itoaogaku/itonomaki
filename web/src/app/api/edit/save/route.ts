import { NextResponse } from "next/server";
import { requireEditAuth } from "@/lib/editAuth";
import { getFile, putFile } from "@/lib/github";
import { SECTION_ORDER } from "@/lib/content";

// Topic titles double as filenames (content/<section>/<topic>.md) and URL
// segments, so path separators and "." lookalikes are rejected outright.
function isValidTitle(title: string): boolean {
  return title.length > 0 && !title.includes("/") && !title.includes("\\") && title !== "." && title !== "..";
}

export async function POST(request: Request) {
  if (!(await requireEditAuth())) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const section = typeof body?.section === "string" ? body.section : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  const isNew = Boolean(body?.isNew);

  if (!SECTION_ORDER.includes(section)) {
    return NextResponse.json({ error: "不正なセクションです" }, { status: 400 });
  }
  if (!isValidTitle(topic)) {
    return NextResponse.json({ error: "不正なトピック名です" }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "本文が空です" }, { status: 400 });
  }

  try {
    // Re-fetch right before writing (rather than trusting a sha the client
    // may have loaded a while ago) so a create can't silently clobber a
    // topic someone else just added, and an update always carries a fresh sha.
    const existing = await getFile(section, topic);
    if (isNew && existing) {
      return NextResponse.json({ error: "同名のトピックが既に存在します" }, { status: 409 });
    }
    if (!isNew && !existing) {
      return NextResponse.json({ error: "編集対象のトピックが見つかりません" }, { status: 404 });
    }

    await putFile(
      section,
      topic,
      content,
      existing?.sha ?? null,
      isNew ? `Add ${section}/${topic} via web editor` : `Update ${section}/${topic} via web editor`
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
