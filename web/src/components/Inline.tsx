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
        if (token.type === "link") {
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2 hover:no-underline"
            >
              {token.content}
            </a>
          );
        }
        return <span key={i}>{token.content}</span>;
      })}
    </>
  );
}
