import type { InlineToken } from "@/lib/markdown";
import { Inline } from "./Inline";

export function Callout({ icon, lines }: { icon: "💡" | "⚠️"; lines: InlineToken[][] }) {
  const isWarning = icon === "⚠️";
  return (
    <div
      className={
        "my-5 flex gap-3 rounded-xl border px-4 py-3.5 text-[0.975rem] leading-[1.85] " +
        (isWarning
          ? "border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"
          : "border-teal-300/60 bg-teal-50 text-teal-950 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-100")
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
