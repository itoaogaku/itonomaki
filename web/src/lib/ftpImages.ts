// Uploads library photos to the trainer's existing Xserver hosting via FTP,
// rather than bundling them into the git repo / Vercel deployment (avoids
// deployment size limits, and reuses hosting the trainer already pays for).
import { Client } from "basic-ftp";
import sharp from "sharp";
import { Readable } from "node:stream";

const REMOTE_DIR = "library-images";
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

  const safeStem = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/gu, "-")
    .slice(0, 60);
  const filename = `${Date.now()}-${safeStem || "image"}.jpg`;

  // Read config env vars first so a missing/misconfigured var reports
  // clearly, rather than being swallowed into the generic network-error
  // message below (which suggests retrying — pointless for a config error).
  const host = envOrThrow("FTP_HOST");
  const user = envOrThrow("FTP_USER");
  const password = envOrThrow("FTP_PASSWORD");

  const client = new Client(15_000); // fail fast rather than leave the editor spinning
  try {
    await client.access({ host, user, password, secure: true });
    await client.ensureDir(REMOTE_DIR);
    await client.uploadFrom(Readable.from(compressed), filename);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`サーバーへのアップロードに失敗しました(${detail})。時間をおいて再度お試しください。`);
  } finally {
    client.close();
  }

  return `${PUBLIC_BASE_URL}/${filename}`;
}
