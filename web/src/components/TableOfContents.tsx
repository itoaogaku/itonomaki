import type { Block } from "@/lib/markdown";
import { inlineText } from "@/lib/markdown";

type HeadingBlock = Extract<Block, { type: "heading2" | "heading3" }>;

export function TableOfContents({ blocks }: { blocks: Block[] }) {
  const headings = blocks.filter((b): b is HeadingBlock => b.type === "heading2" || b.type === "heading3");
  // Not worth showing a table of contents for one or two sections.
  if (headings.length < 3) return null;

  return (
    <nav
      aria-label="目次"
      className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 print:hidden"
    >
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">目次</p>
      <ul className="mt-2 space-y-1 text-sm">
        {headings.map((h, i) => (
          <li key={i} className={h.type === "heading3" ? "pl-4" : undefined}>
            <a href={`#${h.id}`} className="text-[var(--accent)] hover:underline">
              {inlineText(h.text)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
