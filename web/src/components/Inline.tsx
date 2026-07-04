import type { InlineToken } from "@/lib/markdown";

export function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === "bold") {
          return (
            <strong key={i} className="font-semibold text-[var(--fg-strong)]">
              {token.content}
            </strong>
          );
        }
        if (token.type === "code") {
          return (
            <code
              key={i}
              className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[0.875em] text-[var(--code-fg)]"
            >
              {token.content}
            </code>
          );
        }
        return <span key={i}>{token.content}</span>;
      })}
    </>
  );
}
