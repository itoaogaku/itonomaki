import { NextResponse } from "next/server";
import { readRoster, writeRoster } from "@/lib/ftpRoster";

// Called cross-origin from the stopwatch app's 点呼(ロールコール)タブ, same
// as /api/stretch-audio. No session/cookie to share across origins, so
// writes are gated by a bearer token instead (the same STRETCH_AUDIO_TOKEN
// already used for voice-recording uploads — the stopwatch app's own README
// asks users to reuse that password for roster edits too). CORS is left
// wide open: GET is public read-only, POST is protected by the token check.
const MAX_UPLOAD_BYTES = 512 * 1024; // 名簿のJSONはこれで十分すぎるほど大きい

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    const data = await readRoster();
    return json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireAudioToken(request)) {
    return json({ error: "認証が必要です" }, { status: 401 });
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_UPLOAD_BYTES) {
    return json({ error: "データサイズが大きすぎます" }, { status: 400 });
  }
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return json({ error: "JSONの形式が不正です" }, { status: 400 });
  }

  try {
    await writeRoster(data);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
