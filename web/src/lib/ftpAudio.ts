// Stores the stopwatch app's team-shared cue voice recordings on the
// trainer's existing Xserver hosting via FTP — same account/credentials as
// ftpImages.ts, but under its own stretch-audio/ subdirectory so the two
// don't mix.
//
// Filenames are a hash of (category, set, cue text), never the Japanese
// text itself — confirmed by direct testing that this specific Xserver
// account 404s on percent-encoded non-ASCII filenames (e.g.
// stretch-audio/%E6%AC%A1...m4a) even though the exact same bytes under a
// plain ASCII name in the exact same folder serve and play back fine. So a
// manifest.json file (also in stretch-audio/) is the single source of
// truth mapping each hash back to its (category, set, text); listing reads
// that file instead of listing/decoding directory contents.
//
// The stopwatch app has two independent timers that each read cues aloud —
// ストレッチ (stretch) and 補強 (reinforce) — and their recordings must not
// mix (a coach's "反対" for stretch is a different recording from their
// "反対" for reinforce, even though the two are the same word). Recordings
// are further grouped into named "sets" (e.g. a coach's own full set of cue
// readings) so a team can keep several complete recordings side by side and
// pick which one to actually play back. Every recording therefore belongs
// to a (category, set, cue text) triple, which is what's hashed into its
// filename and what the manifest records per entry.
import { Client } from "basic-ftp";
import { PassThrough, Readable } from "node:stream";
import { createHash } from "node:crypto";

const AUDIO_DIR = "stretch-audio";
const PUBLIC_BASE_URL = `https://acc-pg.com/library-images/${AUDIO_DIR}`;
const MANIFEST_FILENAME = "manifest.json";

// Must match the stopwatch app's own DEFAULT_SET_NAME constant exactly —
// it's how recordings made before the "sets" feature existed (all
// necessarily category "stretch") are still labeled.
export const DEFAULT_SET_NAME = "デフォルト(これまでの録音)";

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

function extensionForMimeType(mimeType: string): string {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/aac") return "m4a";
  if (type === "audio/wav" || type === "audio/x-wav") return "wav";
  return "webm"; // covers audio/webm and anything unrecognized (MediaRecorder's most common default)
}

// Pure hex digest — always plain ASCII, never needs percent-encoding.
function hashKey(category: string, setName: string, text: string): string {
  return createHash("sha256").update(`${category}:${setName}:${text}`).digest("hex").slice(0, 24);
}

interface ManifestEntry {
  category: string;
  setName: string;
  text: string;
  filename: string;
}

async function readManifest(client: Client): Promise<ManifestEntry[]> {
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  try {
    await client.downloadTo(stream, MANIFEST_FILENAME);
  } catch {
    return []; // doesn't exist yet — nobody has uploaded anything
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeManifest(client: Client, entries: ManifestEntry[]): Promise<void> {
  await client.uploadFrom(Readable.from(Buffer.from(JSON.stringify(entries), "utf-8")), MANIFEST_FILENAME);
}

// Xserver's default Apache mime.types has no mapping for .m4a/.webm/.ogg —
// confirmed by direct testing (a fresh Blob with an explicit type plays
// fine locally; the identical bytes served from this host did not, until
// this was added). An .htaccess with explicit AddType directives fixes it.
const HTACCESS_CONTENT = "AddType audio/mp4 .m4a\nAddType audio/webm .webm\nAddType audio/ogg .ogg\nAddType audio/wav .wav\n";

async function ensureAudioDir(client: Client): Promise<void> {
  await client.ensureDir(AUDIO_DIR); // creates it if missing and cds into it
  await client.sendIgnoringError("SITE CHMOD 755 .");
  await client.uploadFrom(Readable.from(Buffer.from(HTACCESS_CONTENT, "utf-8")), ".htaccess").catch(() => {});
}

export interface SharedRecording {
  category: string;
  setName: string;
  text: string;
  url: string;
}

/** Lists every cue currently shared on the server, across every category and
 *  set. An empty list (not an error) just means nobody has uploaded anything
 *  yet. */
export async function listSharedRecordings(): Promise<SharedRecording[]> {
  return withClient(async (client) => {
    await client.ensureDir(AUDIO_DIR);
    const manifest = await readManifest(client);
    return manifest.map((e) => ({
      category: e.category,
      setName: e.setName,
      text: e.text,
      url: `${PUBLIC_BASE_URL}/${e.filename}`,
    }));
  });
}

/** Uploads a recording for the given (category, set, cue text) triple,
 *  replacing any existing recording(s) for that same exact triple (even ones
 *  saved under a different audio format/filename previously). Returns the
 *  new public URL. Throws if the upload doesn't actually verify on the
 *  server afterward, instead of reporting a false success. */
export async function uploadSharedRecording(buffer: Buffer, category: string, setName: string, text: string, mimeType: string): Promise<string> {
  const filename = `${hashKey(category, setName, text)}.${extensionForMimeType(mimeType)}`;

  return withClient(async (client) => {
    await ensureAudioDir(client);

    const manifest = await readManifest(client);
    const existing = manifest.find((e) => e.category === category && e.setName === setName && e.text === text);
    if (existing && existing.filename !== filename) {
      await client.remove(existing.filename).catch(() => {});
    }

    await client.uploadFrom(Readable.from(buffer), filename);
    await client.sendIgnoringError(`SITE CHMOD 644 ${filename}`);

    // Confirm the file actually landed with the right size before reporting
    // success — a silent write failure previously left "チーム共有済み"
    // (and a URL) pointing at a file that 404s.
    const remoteSize = await client.size(filename);
    if (remoteSize !== buffer.length) {
      throw new Error(`アップロード後の確認に失敗しました(サーバー上のサイズ ${remoteSize} バイト、期待値 ${buffer.length} バイト)`);
    }

    const nextManifest = manifest.filter((e) => !(e.category === category && e.setName === setName && e.text === text));
    nextManifest.push({ category, setName, text, filename });
    await writeManifest(client, nextManifest);

    return `${PUBLIC_BASE_URL}/${filename}`;
  });
}

/** Deletes whatever recording matches the given (category, set, cue text)
 *  triple. */
export async function deleteSharedRecording(category: string, setName: string, text: string): Promise<void> {
  await withClient(async (client) => {
    await client.ensureDir(AUDIO_DIR);
    const manifest = await readManifest(client);
    const entry = manifest.find((e) => e.category === category && e.setName === setName && e.text === text);
    if (!entry) return;
    await client.remove(entry.filename).catch(() => {});
    await writeManifest(
      client,
      manifest.filter((e) => e !== entry)
    );
  });
}

/** Deletes every recording belonging to the given (category, set). */
export async function deleteSharedSet(category: string, setName: string): Promise<void> {
  await withClient(async (client) => {
    await client.ensureDir(AUDIO_DIR);
    const manifest = await readManifest(client);
    const toRemove = manifest.filter((e) => e.category === category && e.setName === setName);
    for (const entry of toRemove) {
      await client.remove(entry.filename).catch(() => {});
    }
    await writeManifest(
      client,
      manifest.filter((e) => !(e.category === category && e.setName === setName))
    );
  });
}
