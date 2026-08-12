// Stores the stopwatch app's team-shared stretch-cue voice recordings on the
// trainer's existing Xserver hosting via FTP — same account/credentials as
// ftpImages.ts, but under its own stretch-audio/ subdirectory so the two
// don't mix.
//
// Recordings are grouped into named "sets" (e.g. a coach's own full set of
// cue readings) so a team can keep several complete recordings side by side
// and pick which one to actually play back. The original (pre-sets) design
// stored one flat file per cue text directly under stretch-audio/; that
// layout is kept as-is and treated as the implicit DEFAULT_SET_NAME set, so
// recordings made before sets existed keep working with no migration. Any
// other set gets its own stretch-audio/<encoded set name>/ subdirectory.
// Within a set, one file per distinct cue text; re-uploading the same text
// replaces whatever was there before (regardless of audio format), so the
// listing never accumulates stale duplicates for a cue that's been
// re-recorded.
import { Client, FileInfo } from "basic-ftp";
import { Readable } from "node:stream";

const AUDIO_DIR = "stretch-audio";
const PUBLIC_BASE_URL = `https://acc-pg.com/library-images/${AUDIO_DIR}`;

// Must match the stopwatch app's own DEFAULT_SET_NAME constant exactly —
// it's how the client recognizes "this is the flat legacy layout".
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

// Both cue text and set names (Japanese) become filename/directory
// components via percent-encoding — this host has previously stored raw
// non-ASCII names under different bytes than the web server expects,
// producing 404s for files that genuinely exist (see ftpImages.ts).
// Percent-encoding keeps everything pure ASCII while staying a
// deterministic, reversible key for the original text.
function encodeStem(text: string): string {
  return encodeURIComponent(text);
}

function decodeStem(stem: string): string {
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

function dirPathFor(setName: string): string {
  return setName === DEFAULT_SET_NAME ? AUDIO_DIR : `${AUDIO_DIR}/${encodeStem(setName)}`;
}

function publicUrlFor(setName: string, filename: string): string {
  return setName === DEFAULT_SET_NAME ? `${PUBLIC_BASE_URL}/${filename}` : `${PUBLIC_BASE_URL}/${encodeStem(setName)}/${filename}`;
}

export interface SharedRecording {
  setName: string;
  text: string;
  url: string;
}

/** Lists every cue currently shared on the server, across every set. An
 *  empty list (not an error) just means nobody has uploaded anything yet —
 *  the directory may not exist at all in that case. */
export async function listSharedRecordings(): Promise<SharedRecording[]> {
  return withClient(async (client) => {
    let topEntries: FileInfo[];
    try {
      topEntries = await client.list(AUDIO_DIR);
    } catch {
      return [];
    }

    const results: SharedRecording[] = [];
    for (const entry of topEntries) {
      if (entry.isFile) {
        results.push({
          setName: DEFAULT_SET_NAME,
          text: decodeStem(stemOf(entry.name)),
          url: publicUrlFor(DEFAULT_SET_NAME, entry.name),
        });
      } else if (entry.isDirectory) {
        const setName = decodeStem(entry.name);
        const subEntries = await client.list(`${AUDIO_DIR}/${entry.name}`).catch(() => [] as FileInfo[]);
        for (const sub of subEntries) {
          if (!sub.isFile) continue;
          results.push({
            setName,
            text: decodeStem(stemOf(sub.name)),
            url: publicUrlFor(setName, sub.name),
          });
        }
      }
    }
    return results;
  });
}

/** Uploads a recording for the given (set, cue text) pair, replacing any
 *  existing recording(s) for that same exact pair (even ones saved under a
 *  different audio format previously). Returns the new public URL. */
export async function uploadSharedRecording(buffer: Buffer, setName: string, text: string, mimeType: string): Promise<string> {
  const stem = encodeStem(text);
  const filename = `${stem}.${extensionForMimeType(mimeType)}`;
  const dirPath = dirPathFor(setName);

  return withClient(async (client) => {
    await client.ensureDir(dirPath); // creates every needed level and cds into it
    const existing = await client.list().catch(() => [] as FileInfo[]);
    for (const entry of existing) {
      if (entry.isFile && stemOf(entry.name) === stem && entry.name !== filename) {
        await client.remove(entry.name).catch(() => {});
      }
    }
    await client.uploadFrom(Readable.from(buffer), filename);
    return publicUrlFor(setName, filename);
  });
}

/** Deletes whatever recording(s) match the given (set, cue text) pair,
 *  regardless of audio format extension. */
export async function deleteSharedRecording(setName: string, text: string): Promise<void> {
  const stem = encodeStem(text);
  const dirPath = dirPathFor(setName);
  await withClient(async (client) => {
    const entries = await client.list(dirPath).catch(() => [] as FileInfo[]);
    for (const entry of entries) {
      if (entry.isFile && stemOf(entry.name) === stem) {
        await client.remove(`${dirPath}/${entry.name}`).catch(() => {});
      }
    }
  });
}

/** Deletes an entire set. For the default set (the flat legacy layout) this
 *  removes every file directly under stretch-audio/ without touching other
 *  sets' subdirectories; for any other set it removes its whole
 *  subdirectory. */
export async function deleteSharedSet(setName: string): Promise<void> {
  if (setName === DEFAULT_SET_NAME) {
    await withClient(async (client) => {
      const entries = await client.list(AUDIO_DIR).catch(() => [] as FileInfo[]);
      for (const entry of entries) {
        if (entry.isFile) await client.remove(`${AUDIO_DIR}/${entry.name}`).catch(() => {});
      }
    });
    return;
  }
  await withClient(async (client) => {
    await client.removeDir(dirPathFor(setName)).catch(() => {});
  });
}
