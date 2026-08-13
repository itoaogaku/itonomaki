import { NextResponse } from "next/server";
import { listSharedRecordings, uploadSharedRecording, deleteSharedRecording, deleteSharedSet, DEFAULT_SET_NAME } from "@/lib/ftpAudio";

// Called cross-origin from the stopwatch app (a separate static site, and
// sometimes opened straight from file://, per its README) — not from a page
// served by this Next.js app. There's no session/cookie to share across
// origins, so writes are gated by a bearer token instead, and CORS is left
// wide open (safe here since GET is public read-only and POST/DELETE are
// already protected by the token check, not by origin).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // a 30s voice clip is well under 1MB
const DEFAULT_CATEGORY = "stretch"; // matches the stopwatch app's older, category-less recordings

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...corsHeaders(), ...init?.headers } });
}

function requireAudioToken(request: Request): boolean {
  const expected = process.env.STRETCH_AUDIO_TOKEN?.trim();
  if (!expected) return false; // unconfigured = writes disabled, not "anyone can write"
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return provided === expected;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  try {
    const items = await listSharedRecordings();
    // Must always reflect the latest upload — a stale cached list on one
    // device is indistinguishable from "the recording never arrived".
    return json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAudioToken(request)) {
    return json({ error: "認証が必要です" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const text = form?.get("text");
  const setNameRaw = form?.get("setName");
  const setName = typeof setNameRaw === "string" && setNameRaw.trim() ? setNameRaw.trim() : DEFAULT_SET_NAME;
  const categoryRaw = form?.get("category");
  const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : DEFAULT_CATEGORY;
  if (!(file instanceof File) || typeof text !== "string" || !text.trim()) {
    return json({ error: "file と text の両方が必要です" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "ファイルサイズが大きすぎます(5MBまで)" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadSharedRecording(buffer, category, setName, text, file.type || "audio/webm");
    return json({ url });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// DELETE ?category=...&setName=...&text=...  → remove one cue's recording from that set
// DELETE ?category=...&setName=...           → remove the entire set
export async function DELETE(request: Request) {
  if (!requireAudioToken(request)) {
    return json({ error: "認証が必要です" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const setName = params.get("setName");
  const text = params.get("text");
  const categoryParam = params.get("category");
  const category = categoryParam && categoryParam.trim() ? categoryParam.trim() : DEFAULT_CATEGORY;
  if (!setName) {
    return json({ error: "setName が必要です" }, { status: 400 });
  }

  try {
    if (text) {
      await deleteSharedRecording(category, setName, text);
    } else {
      await deleteSharedSet(category, setName);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
