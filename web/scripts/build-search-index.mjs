// Builds public/search-index.json: a flat, plain-text index of every topic's
// body content (headings/tables/callouts stripped down to plain sentences),
// used by the sidebar's search box to match on content, not just titles.
// Kept as a separate static asset (rather than embedded in every page's
// props) so it's fetched once, lazily, only when the user actually searches.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const contentDir = path.join(repoRoot, "notion_sync", "content");
const destination = path.join(scriptDir, "..", "public", "search-index.json");

function stripMarkdown(raw) {
  return raw
    .split("\n")
    .map((line) => {
      let l = line.trim();
      if (!l || /^[-:|\s]+$/.test(l) || l === "---") return "";
      l = l.replace(/^#{1,6}\s+/, "");
      l = l.replace(/^[>💡⚠️\s]+/, "");
      l = l.replace(/^[-・]\s+/, "");
      l = l.replace(/^\d+\.\s+/, "");
      l = l.replace(/!\[.*?\]\(.*?\)/g, "");
      l = l.replace(/\*\*(.+?)\*\*/g, "$1");
      l = l.replace(/`(.+?)`/g, "$1");
      l = l.replace(/\|/g, " ");
      return l.trim();
    })
    .filter(Boolean)
    .join(" ");
}

if (!existsSync(contentDir)) {
  console.error(`[build-search-index] content dir not found: ${contentDir}`);
  process.exit(1);
}

const index = [];
for (const section of readdirSync(contentDir, { withFileTypes: true })) {
  if (!section.isDirectory()) continue;
  const sectionDir = path.join(contentDir, section.name);
  for (const file of readdirSync(sectionDir, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".md")) continue;
    const slug = file.name.replace(/\.md$/, "");
    const raw = readFileSync(path.join(sectionDir, file.name), "utf-8");
    index.push({ sectionSlug: section.name, slug, text: stripMarkdown(raw) });
  }
}

writeFileSync(destination, JSON.stringify(index));
console.log(`[build-search-index] wrote ${index.length} topics -> ${destination}`);
