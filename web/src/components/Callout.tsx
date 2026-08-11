import type { InlineToken } from "@/lib/markdown";
import { Inline } from "./Inline";

export function Callout({ icon, lines }: { icon: "💡" | "⚠️"; lines: InlineToken[][] }) {
  const isWarning = icon === "⚠️";
  return (
    <div
      className={
        "my-5 flex gap-3 rounded-xl border px-4 py-3.5 text-[0.975rem] leading-[1.85] print:break-inside-avoid " +
        (isWarning
          ? "border-[var(--callout-warn-border)] bg-[var(--callout-warn-bg)] text-[var(--callout-warn-fg)]"
          : "border-[var(--callout-info-border)] bg-[var(--callout-info-bg)] text-[var(--callout-info-fg)]")
      }
    >
      <span className="shrink-0 select-none text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className={i === 0 ? "" : "opacity-90"}>
            <Inline tokens={line} />
          </p>
        ))}
      </div>
    </div>
  );
}
