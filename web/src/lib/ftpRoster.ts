// Stores the stopwatch app's team-shared 点呼(ロールコール)名簿 — the
// member list (name, grade, tags) managed from its 名簿の登録・編集 screen
// — as a single JSON file on the trainer's existing Xserver hosting via
// FTP. Same account/credentials as ftpAudio.ts / ftpImages.ts, but its own
// rollcall/ subdirectory so the three don't mix.
//
// Unlike the audio recordings (which need a public, playable URL for
// <audio src>), the roster is just JSON that the stopwatch app needs to
// read as data — and this Xserver account doesn't send CORS headers, so a
// browser can't fetch() a URL hosted there directly (confirmed by the
// stretch-audio work). Sidestepping that entirely: this module runs
// server-side in the Next.js API route, downloads the file over FTP itself,
// and the route hands the parsed JSON back to the client directly in its
// own (CORS-open) response. No separate public URL is needed or returned.
import { Client } from "basic-ftp";
import { PassThrough, Readable } from "node:stream";

const ROSTER_DIR = "rollcall";
const ROSTER_FILENAME = "roster.json";

function envOrThrow(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const host = envOrThrow("FTP_HOST");
  const user = envOrThrow("FTP_USER");
  const password = envOrThrow("FTP_PASSWORD");

  const client = new Client(15_000);
  try {
    await client.access({ host, user, password, secure: true });
    return await fn(client);
  } finally {
    client.close();
  }
}

/** Reads the shared roster JSON. Returns null if nobody has uploaded one yet
 *  (not an error — the stopwatch app falls back to its own local copy). */
export async function readRoster(): Promise<unknown | null> {
  return withClient(async (client) => {
    await client.ensureDir(ROSTER_DIR);
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    try {
      await client.downloadTo(stream, ROSTER_FILENAME);
    } catch {
      return null;
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return null; // 壊れたデータより「共有分なし」扱いの方が安全
    }
  });
}

/** Overwrites the shared roster JSON wholesale (the stopwatch app always
 *  uploads its full current roster, not incremental diffs). Throws if the
 *  upload doesn't actually verify on the server afterward. */
export async function writeRoster(data: unknown): Promise<void> {
  const buffer = Buffer.from(JSON.stringify(data), "utf-8");
  await withClient(async (client) => {
    await client.ensureDir(ROSTER_DIR);
    await client.sendIgnoringError("SITE CHMOD 755 .");
    await client.uploadFrom(Readable.from(buffer), ROSTER_FILENAME);
    await client.sendIgnoringError(`SITE CHMOD 644 ${ROSTER_FILENAME}`);

    const remoteSize = await client.size(ROSTER_FILENAME);
    if (remoteSize !== buffer.length) {
      throw new Error(`アップロード後の確認に失敗しました(サーバー上のサイズ ${remoteSize} バイト、期待値 ${buffer.length} バイト)`);
    }
  });
}
