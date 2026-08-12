// Stores the stopwatch app's team-shared stretch-cue voice recordings on the
// trainer's existing Xserver hosting via FTP — same account/credentials as
// ftpImages.ts, but under its own stretch-audio/ subdirectory so the two
// don't mix. One file per distinct cue text; re-uploading the same text
// replaces whatever was there before (regardless of audio format), so the
// listing never accumulates stale duplicates for a cue that's been
// re-recorded.
import { Client, FileInfo } from "basic-ftp";
import { Readable } from "node:stream";

const AUDIO_DIR = "stretch-audio";
const PUBLIC_BASE_URL = `https://acc-pg.com/library-images/${AUDIO_DIR}`;

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

// The cue text (Japanese) becomes the filename stem via percent-encoding —
// this host has previously stored raw non-ASCII filenames under different
// bytes than the web server expects, producing 404s for files that
// genuinely exist (see ftpImages.ts). Percent-encoding keeps the filename
// pure ASCII while staying a deterministic, reversible key for the text.
function encodeCueStem(text: string): string {
  return encodeURIComponent(text);
}

function decodeCueStem(stem: string): string {
  try {
    return decodeURIComponent(stem);
  } catch {
    return stem;
  }
}

function stemOf(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? filename : filename.slice(0, dotIndex);
}

export interface SharedRecording {
  text: string;
  url: string;
}

/** Lists every cue currently shared on the server. An empty list (not an
 *  error) just means nobody has uploaded anything yet — the directory may
 *  not exist at all in that case. */
export async function listSharedRecordings(): Promise<SharedRecording[]> {
  return withClient(async (client) => {
    let entries: FileInfo[];
    try {
      entries = await client.list(AUDIO_DIR);
    } catch {
      return [];
    }
    return entries
      .filter((e) => e.isFile)
      .map((e) => ({
        text: decodeCueStem(stemOf(e.name)),
        url: `${PUBLIC_BASE_URL}/${e.name}`,
      }));
  });
}

/** Uploads a recording for the given cue text, replacing any existing
 *  recording(s) for that same exact text (even ones saved under a different
 *  audio format previously). Returns the new public URL. */
export async function uploadSharedRecording(buffer: Buffer, text: string, mimeType: string): Promise<string> {
  const stem = encodeCueStem(text);
  const filename = `${stem}.${extensionForMimeType(mimeType)}`;

  return withClient(async (client) => {
    await client.ensureDir(AUDIO_DIR); // also cds into it
    const existing = await client.list().catch(() => [] as FileInfo[]);
    for (const entry of existing) {
      if (entry.isFile && stemOf(entry.name) === stem && entry.name !== filename) {
        await client.remove(entry.name).catch(() => {});
      }
    }
    await client.uploadFrom(Readable.from(buffer), filename);
    return `${PUBLIC_BASE_URL}/${filename}`;
  });
}

/** Deletes whatever recording(s) match the given cue text, regardless of
 *  audio format extension. */
export async function deleteSharedRecording(text: string): Promise<void> {
  const stem = encodeCueStem(text);
  await withClient(async (client) => {
    const entries = await client.list(AUDIO_DIR).catch(() => [] as FileInfo[]);
    for (const entry of entries) {
      if (entry.isFile && stemOf(entry.name) === stem) {
        await client.remove(`${AUDIO_DIR}/${entry.name}`).catch(() => {});
      }
    }
  });
}
