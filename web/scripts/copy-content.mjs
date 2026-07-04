// Copies notion_sync/content (the source of truth, edited via git) into
// web/content so the Next.js app has a self-contained data directory.
//
// Uses the script's own location (not process.cwd()) to find the source, so
// this works the same whether run locally, in CI, or on Vercel with the
// project "Root Directory" set to web/.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const source = path.join(repoRoot, "notion_sync", "content");
const destination = path.join(scriptDir, "..", "content");

if (!existsSync(source)) {
  console.error(`[copy-content] source not found: ${source}`);
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });

console.log(`[copy-content] copied ${source} -> ${destination}`);
