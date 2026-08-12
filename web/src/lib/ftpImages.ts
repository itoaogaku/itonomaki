// Uploads library photos to the trainer's existing Xserver hosting via FTP,
// rather than bundling them into the git repo / Vercel deployment (avoids
// deployment size limits, and reuses hosting the trainer already pays for).
import { Client } from "basic-ftp";
import sharp from "sharp";
import { PassThrough, Readable } from "node:stream";

// The FTP account itself is scoped to library-images/ as its login root
// (configured on the Xserver side), so uploads land directly there — no
// subdirectory to create or change into.
const PUBLIC_BASE_URL = "https://acc-pg.com/library-images";

// Phone photos are routinely 3000px+ wide and several MB; this keeps the
// published file small without visibly hurting quality for an article image.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

/** Trimmed to survive a trailing newline/space picked up when pasting into
 *  Vercel's env var field — the same issue seen with EDIT_PASSWORD. */
function envOrThrow(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

// ASCII-only: FTP has no guaranteed charset for filenames, and this host
// has previously stored non-ASCII (Japanese) filenames under different
// bytes than what the web server expects, producing 404s for files that
// genuinely exist. Stripping to ASCII sidesteps that entirely.
function sanitizeStem(originalName: string): string {
  return originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uploadBuffer(buffer: Buffer, filename: string): Promise<void> {
  // Read config env vars first so a missing/misconfigured var reports
  // clearly, rather than being swallowed into the generic network-error
  // message below (which suggests retrying — pointless for a config error).
  const host = envOrThrow("FTP_HOST");
  const user = envOrThrow("FTP_USER");
  const password = envOrThrow("FTP_PASSWORD");

  const client = new Client(15_000); // fail fast rather than leave the editor spinning
  try {
    await client.access({ host, user, password, secure: true });
    await client.uploadFrom(Readable.from(buffer), filename);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`サーバーへのアップロードに失敗しました(${detail})。時間をおいて再度お試しください。`);
  } finally {
    client.close();
  }
}

/** Resizes/re-encodes an uploaded image so large phone photos don't eat
 *  into hosting space, then uploads it over FTP and returns its public URL. */
export async function uploadImage(fileBuffer: Buffer, originalName: string): Promise<string> {
  let compressed: Buffer;
  try {
    compressed = await sharp(fileBuffer)
      .rotate() // apply EXIF orientation, then strip metadata (incl. GPS)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch {
    // Most likely a HEIC/HEIF photo (iPhone default), which this build of
    // sharp can't decode without an extra codec. JPEG/PNG/WebP always work.
    throw new Error(
      "この画像形式は変換できませんでした。iPhoneの場合は「設定→カメラ→フォーマット」を「互換性優先」にするか、写真を選ぶ際に自動でJPEGに変換されるようにしてください。"
    );
  }

  const filename = `${Date.now()}-${sanitizeStem(originalName) || "image"}.jpg`;
  await uploadBuffer(compressed, filename);
  return `${PUBLIC_BASE_URL}/${filename}`;
}

/** Uploads a PDF as-is (no conversion) and returns its public URL. Lands in
 *  the same library-images/ folder as photos — it's just a directory on the
 *  FTP account, not actually restricted to images. */
export async function uploadPdf(fileBuffer: Buffer, originalName: string): Promise<string> {
  const filename = `${Date.now()}-${sanitizeStem(originalName) || "file"}.pdf`;
  await uploadBuffer(fileBuffer, filename);
  return `${PUBLIC_BASE_URL}/${filename}`;
}

async function downloadBuffer(client: Client, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  await client.downloadTo(stream, remotePath);
  return Buffer.concat(chunks);
}

/** Rotates an already-uploaded image 90° clockwise and uploads it under a new
 *  filename (returning the new URL) rather than overwriting the original —
 *  Xserver's edge cache (and browsers) can hold onto a URL's old bytes for a
 *  long time, so reusing the same filename left rotations invisible even
 *  after a fresh page load. The caller is responsible for swapping the
 *  markdown to the new URL and saving.
 *
 *  Deliberately does NOT delete the original file: this function only
 *  guarantees a new file exists, not that the caller's save actually lands
 *  (network error, unsaved draft, etc.), and deleting on that assumption
 *  once already left a saved page pointing at a file that no longer
 *  existed. An unreferenced old file is just a few KB of clutter — a
 *  broken image is much worse. */
export async function rotateImage(url: string): Promise<string> {
  const prefix = `${PUBLIC_BASE_URL}/`;
  if (!url.startsWith(prefix)) {
    throw new Error("この画像はサーバー上の写真ライブラリのものではないため回転できません");
  }
  const oldFilename = url.slice(prefix.length);
  if (!oldFilename || oldFilename.includes("/")) {
    throw new Error("画像ファイル名が不正です");
  }
  const stem = oldFilename.replace(/\.[^.]+$/, "");
  const newFilename = `${Date.now()}-${stem}.jpg`;

  const host = envOrThrow("FTP_HOST");
  const user = envOrThrow("FTP_USER");
  const password = envOrThrow("FTP_PASSWORD");

  const client = new Client(15_000);
  try {
    await client.access({ host, user, password, secure: true });
    const original = await downloadBuffer(client, oldFilename);
    const rotated = await sharp(original).rotate(90).jpeg({ quality: JPEG_QUALITY }).toBuffer();
    await client.uploadFrom(Readable.from(rotated), newFilename);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`画像の回転に失敗しました(${detail})。時間をおいて再度お試しください。`);
  } finally {
    client.close();
  }

  return `${PUBLIC_BASE_URL}/${newFilename}`;
}
