// Stores the stopwatch app's team-shared cue voice recordings on the
// trainer's existing Xserver hosting via FTP — same account/credentials as
// ftpImages.ts, but under its own stretch-audio/ subdirectory so the two
// don't mix.
//
// The stopwatch app has two independent timers that each read cues aloud —
// ストレッチ (stretch) and 補強 (reinforce) — and their recordings must not
// mix (a coach's "反対" for stretch is a different recording from their
// "反対" for reinforce, even though the two are the same word). So every
// recording belongs to a (category, set, cue text) triple: "category" is
// "stretch" or "reinforce", and "set" is a named collection within that
// category (e.g. a coach's own full set of cue readings) so a team can keep
// several complete recordings side by side and pick which one to actually
// play back.
//
// The original (pre-category, pre-set) design stored one flat file per cue
// text directly under stretch-audio/; that layout is kept as-is and treated
// as the implicit (category: "stretch", set: DEFAULT_SET_NAME) location, so
// recordings made before either feature existed keep working with no
// migration — they were always stretch-only anyway, since 補強 didn't exist
// yet. Every other (category, set) pair gets its own subdirectory: stretch's
// other sets live at stretch-audio/<set>/, and every reinforce set (default
// included) lives at stretch-audio/reinforce/<set>/ — "reinforce" is
// therefore a reserved name that can't also be used as a custom stretch set
// name (an acceptable, unlikely-to-matter edge case).
//
// Within a (category, set), one file per distinct cue text; re-uploading the
// same text replaces whatever was there before (regardless of audio
// format), so the listing never accumulates stale duplicates for a cue
// that's been re-recorded.
import { Client, FileInfo } from "basic-ftp";
import { Readable } from "node:stream";

const AUDIO_DIR = "stretch-audio";
const PUBLIC_BASE_URL = `https://acc-pg.com/library-images/${AUDIO_DIR}`;
const REINFORCE_DIR_NAME = "reinforce";

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

function categoryDir(category: string): string {
  return category === "stretch" ? AUDIO_DIR : `${AUDIO_DIR}/${REINFORCE_DIR_NAME}`;
}

function dirPathFor(category: string, setName: string): string {
  const base = categoryDir(category);
  return setName === DEFAULT_SET_NAME ? base : `${base}/${encodeStem(setName)}`;
}

function publicUrlFor(category: string, setName: string, filename: string): string {
  const base = category === "stretch" ? PUBLIC_BASE_URL : `${PUBLIC_BASE_URL}/${REINFORCE_DIR_NAME}`;
  return setName === DEFAULT_SET_NAME ? `${base}/${filename}` : `${base}/${encodeStem(setName)}/${filename}`;
}

export interface SharedRecording {
  category: string;
  setName: string;
  text: string;
  url: string;
}

/** Lists every cue currently shared on the server, across every category and
 *  set. An empty list (not an error) just means nobody has uploaded anything
 *  yet — the directory may not exist at all in that case. */
export async function listSharedRecordings(): Promise<SharedRecording[]> {
  return withClient(async (client) => {
    const results: SharedRecording[] = [];

    async function listCategory(category: string, dir: string) {
      const entries = await client.list(dir).catch(() => [] as FileInfo[]);
      for (const entry of entries) {
        if (entry.isFile) {
          results.push({
            category,
            setName: DEFAULT_SET_NAME,
            text: decodeStem(stemOf(entry.name)),
            url: publicUrlFor(category, DEFAULT_SET_NAME, entry.name),
          });
        } else if (entry.isDirectory) {
          if (category === "stretch" && entry.name === REINFORCE_DIR_NAME) {
            await listCategory("reinforce", `${dir}/${entry.name}`);
            continue;
          }
          const setName = decodeStem(entry.name);
          const subEntries = await client.list(`${dir}/${entry.name}`).catch(() => [] as FileInfo[]);
          for (const sub of subEntries) {
            if (!sub.isFile) continue;
            results.push({
              category,
              setName,
              text: decodeStem(stemOf(sub.name)),
              url: publicUrlFor(category, setName, sub.name),
            });
          }
        }
      }
    }

    await listCategory("stretch", AUDIO_DIR);
    return results;
  });
}

/** Uploads a recording for the given (category, set, cue text) triple,
 *  replacing any existing recording(s) for that same exact triple (even ones
 *  saved under a different audio format previously). Returns the new public
 *  URL. */
export async function uploadSharedRecording(buffer: Buffer, category: string, setName: string, text: string, mimeType: string): Promise<string> {
  const stem = encodeStem(text);
  const filename = `${stem}.${extensionForMimeType(mimeType)}`;
  const dirPath = dirPathFor(category, setName);

  return withClient(async (client) => {
    await client.ensureDir(dirPath); // creates every needed level and cds into it
    const existing = await client.list().catch(() => [] as FileInfo[]);
    for (const entry of existing) {
      if (entry.isFile && stemOf(entry.name) === stem && entry.name !== filename) {
        await client.remove(entry.name).catch(() => {});
      }
    }
    await client.uploadFrom(Readable.from(buffer), filename);
    return publicUrlFor(category, setName, filename);
  });
}

/** Deletes whatever recording(s) match the given (category, set, cue text)
 *  triple, regardless of audio format extension. */
export async function deleteSharedRecording(category: string, setName: string, text: string): Promise<void> {
  const stem = encodeStem(text);
  const dirPath = dirPathFor(category, setName);
  await withClient(async (client) => {
    const entries = await client.list(dirPath).catch(() => [] as FileInfo[]);
    for (const entry of entries) {
      if (entry.isFile && stemOf(entry.name) === stem) {
        await client.remove(`${dirPath}/${entry.name}`).catch(() => {});
      }
    }
  });
}

/** Deletes an entire (category, set). For a category's default set (the
 *  flat legacy layout for stretch, or the equivalent flat layout directly
 *  under stretch-audio/reinforce/ for reinforce) this removes every file
 *  directly under that category's directory without touching other sets'
 *  subdirectories; for any other set it removes its whole subdirectory. */
export async function deleteSharedSet(category: string, setName: string): Promise<void> {
  if (setName === DEFAULT_SET_NAME) {
    const dir = categoryDir(category);
    await withClient(async (client) => {
      const entries = await client.list(dir).catch(() => [] as FileInfo[]);
      for (const entry of entries) {
        if (entry.isFile) await client.remove(`${dir}/${entry.name}`).catch(() => {});
      }
    });
    return;
  }
  await withClient(async (client) => {
    await client.removeDir(dirPathFor(category, setName)).catch(() => {});
  });
}
