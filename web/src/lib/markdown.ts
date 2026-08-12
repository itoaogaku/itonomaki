// Lightweight Markdown parser mirroring notion_sync/md_to_blocks.py's subset:
// headings, 💡/⚠️ blockquote callouts (multi-line lines merge into one
// callout, matching the Notion sync fix), tables, checklists, bullet/numbered
// lists, bold/code inline, dividers, paragraphs.

export type InlineToken =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "code"; content: string }
  | { type: "link"; content: string; href: string };

export type Block =
  | { type: "heading1"; text: InlineToken[] }
  | { type: "heading2" | "heading3"; text: InlineToken[]; id: string }
  | { type: "paragraph"; text: InlineToken[] }
  | { type: "divider" }
  | { type: "callout"; icon: "💡" | "⚠️"; lines: InlineToken[][] }
  | { type: "todo"; text: InlineToken[]; checked: boolean }
  | { type: "bulleted_list_item"; text: InlineToken[] }
  | { type: "numbered_list_item"; text: InlineToken[] }
  | { type: "table"; header: InlineToken[][]; rows: InlineToken[][][] }
  | { type: "image"; src: string; alt: string };

const INLINE_PATTERN = /(\*\*.+?\*\*|`.+?`|\[[^\]]*\]\([^)]*\))/;
const IMAGE_PATTERN = /^!\[(.*?)\]\((.*?)\)$/;
const LINK_PATTERN = /^\[([^\]]*)\]\(([^)]*)\)$/;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const part of text.split(INLINE_PATTERN)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      tokens.push({ type: "bold", content: part.slice(2, -2) });
    } else if (part.startsWith("`") && part.endsWith("`")) {
      tokens.push({ type: "code", content: part.slice(1, -1) });
    } else {
      const linkMatch = LINK_PATTERN.exec(part);
      if (linkMatch) {
        tokens.push({ type: "link", content: linkMatch[1], href: linkMatch[2] });
      } else {
        tokens.push({ type: "text", content: part });
      }
    }
  }
  if (tokens.length === 0) tokens.push({ type: "text", content: "" });
  return tokens;
}

export function inlineText(tokens: InlineToken[]): string {
  return tokens.map((t) => t.content).join("");
}

/** Anchor id for a heading, from its own text — Japanese text is valid in an
 *  HTML id/URI fragment, so no transliteration is needed, just stripping
 *  whitespace and characters that would break an id or a URL fragment. */
function slugify(text: string): string {
  return text.trim().replace(/\s+/g, "-").replace(/[#"'<>&]/g, "");
}

function parseTableRow(line: string): InlineToken[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

function isTableSeparator(line: string): boolean {
  // Matches rows like "| --- | :---: |" once cell delimiters are stripped.
  return /^[\s:|-]+$/.test(line);
}

export function parseMarkdown(mdText: string, imageBase: string = ""): Block[] {
  const lines = mdText.split("\n");
  const blocks: Block[] = [];
  let tableBuffer: string[] = [];
  let quoteBuffer: string[] = [];

  // Same heading text appears more than once in a few topics (e.g. repeated
  // "高進させる要因" subheadings) — dedupe so anchors/TOC links stay unique.
  const seenIds = new Map<string, number>();
  const headingId = (text: string): string => {
    const base = slugify(text) || "section";
    const count = seenIds.get(base) ?? 0;
    seenIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const [header, ...rows] = tableBuffer;
    const dataRows = rows.filter((r) => !isTableSeparator(r));
    blocks.push({
      type: "table",
      header: parseTableRow(header),
      rows: dataRows.map(parseTableRow),
    });
    tableBuffer = [];
  };

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    let first = quoteBuffer[0];
    let icon: "💡" | "⚠️" = "💡";
    if (first.startsWith("⚠️")) {
      icon = "⚠️";
      first = first.slice("⚠️".length).trim();
    } else if (first.startsWith("💡")) {
      icon = "💡";
      first = first.slice("💡".length).trim();
    }
    const lines = [first, ...quoteBuffer.slice(1)];
    blocks.push({ type: "callout", icon, lines: lines.map(parseInline) });
    quoteBuffer = [];
  };

  for (const rawLine of lines) {
    const stripped = rawLine.trim();

    if (stripped.startsWith("|") && stripped.endsWith("|")) {
      tableBuffer.push(stripped);
      continue;
    }
    flushTable();

    if (!stripped.startsWith(">")) {
      flushQuote();
    }

    if (!stripped) continue;

    if (stripped.startsWith("### ")) {
      const text = stripped.slice(4);
      blocks.push({ type: "heading3", text: parseInline(text), id: headingId(text) });
    } else if (stripped.startsWith("## ")) {
      const text = stripped.slice(3);
      blocks.push({ type: "heading2", text: parseInline(text), id: headingId(text) });
    } else if (stripped.startsWith("# ")) {
      blocks.push({ type: "heading1", text: parseInline(stripped.slice(2)) });
    } else if (stripped === "---") {
      blocks.push({ type: "divider" });
    } else if (stripped.startsWith(">")) {
      quoteBuffer.push(stripped.replace(/^>+/, "").trim());
    } else if (IMAGE_PATTERN.test(stripped)) {
      const match = stripped.match(IMAGE_PATTERN)!;
      // Uploaded photos (web editor) are already-absolute URLs (hosted
      // externally, see src/lib/ftpImages.ts) and must be used as-is.
      // Everything else follows the source convention: markdown always
      // points at an "images/" folder alongside the topic file (see
      // notion_sync/content/<section>/images/); the public copy drops that
      // intermediate segment (see copy-content.mjs), so the prefix is
      // stripped here to match.
      const src = /^https?:\/\//.test(match[2]) ? match[2] : imageBase + match[2].replace(/^images\//, "");
      blocks.push({ type: "image", alt: match[1], src });
    } else if (/^- \[ \] /.test(stripped)) {
      blocks.push({ type: "todo", text: parseInline(stripped.slice(6)), checked: false });
    } else if (/^- \[[xX]\] /.test(stripped)) {
      blocks.push({ type: "todo", text: parseInline(stripped.slice(6)), checked: true });
    } else if (/^[-・]\s/.test(stripped)) {
      blocks.push({ type: "bulleted_list_item", text: parseInline(stripped.slice(2)) });
    } else if (/^\d+\.\s/.test(stripped)) {
      blocks.push({
        type: "numbered_list_item",
        text: parseInline(stripped.replace(/^\d+\.\s/, "")),
      });
    } else {
      blocks.push({ type: "paragraph", text: parseInline(stripped) });
    }
  }

  flushTable();
  flushQuote();
  return blocks;
}
