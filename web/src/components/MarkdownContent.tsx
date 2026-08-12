import type { Block } from "@/lib/markdown";
import { Inline } from "./Inline";
import { Callout } from "./Callout";

type ListKind = "bulleted_list_item" | "numbered_list_item" | "todo";

type Group =
  | { kind: "list"; listType: "bulleted_list_item"; items: Extract<Block, { type: "bulleted_list_item" }>[] }
  | { kind: "list"; listType: "numbered_list_item"; items: Extract<Block, { type: "numbered_list_item" }>[] }
  | { kind: "list"; listType: "todo"; items: Extract<Block, { type: "todo" }>[] }
  | { kind: "single"; block: Exclude<Block, { type: ListKind }> };

function groupBlocks(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  for (const block of blocks) {
    if (block.type === "bulleted_list_item") {
      const last = groups[groups.length - 1];
      if (last?.kind === "list" && last.listType === "bulleted_list_item") {
        last.items.push(block);
      } else {
        groups.push({ kind: "list", listType: "bulleted_list_item", items: [block] });
      }
    } else if (block.type === "numbered_list_item") {
      const last = groups[groups.length - 1];
      if (last?.kind === "list" && last.listType === "numbered_list_item") {
        last.items.push(block);
      } else {
        groups.push({ kind: "list", listType: "numbered_list_item", items: [block] });
      }
    } else if (block.type === "todo") {
      const last = groups[groups.length - 1];
      if (last?.kind === "list" && last.listType === "todo") {
        last.items.push(block);
      } else {
        groups.push({ kind: "list", listType: "todo", items: [block] });
      }
    } else {
      groups.push({ kind: "single", block });
    }
  }
  return groups;
}

export function MarkdownContent({ blocks }: { blocks: Block[] }) {
  // The page's own <h1> already shows the topic title, so the leading
  // "# タイトル" heading in the source file would just be a duplicate.
  const body = blocks.filter((b) => b.type !== "heading1");
  const groups = groupBlocks(body);

  return (
    <div className="space-y-1">
      {groups.map((group, i) => {
        if (group.kind === "single") {
          const block = group.block;
          switch (block.type) {
            case "heading2":
              return (
                <h2
                  key={i}
                  id={block.id}
                  className="mt-10 mb-4 scroll-mt-24 border-b border-[var(--border)] pb-2 text-xl font-bold tracking-tight text-[var(--fg-strong)] first:mt-0"
                >
                  <Inline tokens={block.text} />
                </h2>
              );
            case "heading3":
              return (
                <h3
                  key={i}
                  id={block.id}
                  className="mt-8 mb-3 scroll-mt-24 text-lg font-semibold text-[var(--fg-strong)]"
                >
                  <Inline tokens={block.text} />
                </h3>
              );
            case "paragraph":
              return (
                <p key={i} className="my-3 leading-[1.9] text-[var(--fg)]">
                  <Inline tokens={block.text} />
                </p>
              );
            case "divider":
              return <hr key={i} className="my-8 border-[var(--border)]" />;
            case "image":
              return (
                <figure key={i} className="my-6 print:break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element -- svg illustrations, no need for next/image optimization */}
                  <img
                    src={block.src}
                    alt={block.alt}
                    className="mx-auto max-w-full rounded-lg border border-[var(--border)] bg-white"
                  />
                  {block.alt && (
                    <figcaption className="mt-2 text-center text-sm text-[var(--muted)]">
                      {block.alt}
                    </figcaption>
                  )}
                </figure>
              );
            case "callout":
              return <Callout key={i} icon={block.icon} lines={block.lines} />;
            case "table":
              return (
                <div key={i} className="my-5 overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full min-w-[960px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-[var(--surface-2)]">
                        {block.header.map((cell, ci) => (
                          <th
                            key={ci}
                            className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left font-semibold text-[var(--fg-strong)]"
                          >
                            <Inline tokens={cell} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, ri) => (
                        <tr key={ri} className="odd:bg-transparent even:bg-[var(--surface-2)]/40 print:break-inside-avoid">
                          {row.map((cell, ci) => (
                            <td key={ci} className="border-b border-[var(--border)]/60 px-3 py-2 align-top">
                              <Inline tokens={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            default:
              return null;
          }
        }

        if (group.listType === "numbered_list_item") {
          return (
            <ol key={i} className="my-3 list-decimal space-y-1.5 pl-6 leading-[1.9] marker:text-[var(--muted)]">
              {group.items.map((item, ii) => (
                <li key={ii}>
                  <Inline tokens={item.text} />
                </li>
              ))}
            </ol>
          );
        }

        if (group.listType === "todo") {
          return (
            <ul key={i} className="my-3 space-y-1.5">
              {group.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-2 leading-[1.9]">
                  <span
                    className={
                      "mt-[0.4em] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border " +
                      (item.checked
                        ? "border-teal-500 bg-teal-500/90"
                        : "border-[var(--muted)]")
                    }
                    aria-hidden
                  >
                    {item.checked && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-white stroke-[2]">
                        <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={item.checked ? "text-[var(--muted)] line-through" : ""}>
                    <Inline tokens={item.text} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <ul key={i} className="my-3 list-disc space-y-1.5 pl-6 leading-[1.9] marker:text-[var(--muted)]">
            {group.items.map((item, ii) => (
              <li key={ii}>
                <Inline tokens={item.text} />
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
