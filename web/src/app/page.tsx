import Link from "next/link";
import { getSections } from "@/lib/content";

const SECTION_ICON: Record<string, string> = {
  フィジカル: "💪",
  メンタル: "🧠",
  部位別: "🩹",
  種目別: "🏋️",
  トレーナー: "📋",
};

const SECTION_BLURB: Record<string, string> = {
  フィジカル: "トレーニング・リカバリー・栄養など身体づくり全般の知見",
  メンタル: "コーチングコミュニケーション・行動変容・心理学の知見",
  部位別: "怪我・痛みの部位別メカニズムと対応",
  種目別: "筋肉・部位ごとのトレーニング種目集",
  トレーナー: "セッションの進め方・特殊な対象者への対応",
};

export default function HomePage() {
  const sections = getSections();
  const totalTopics = sections.reduce((sum, s) => sum + s.topicCount, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-16">
      <p className="text-sm font-medium tracking-wide text-[var(--accent)] uppercase">Trainer Knowledge Base</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--fg-strong)] md:text-4xl">
        青トレ(基礎知識)
      </h1>
      <p className="mt-4 max-w-2xl leading-[1.9] text-[var(--muted)]">
        現場で蓄積してきた知見に、誰が読んでも理解できるよう基礎知識の解説を添えて整理したナレッジベースです。
        全{sections.length}カテゴリ・{totalTopics}トピックを収録しています。
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.slug}
            href={`/${encodeURIComponent(section.slug)}`}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:shadow-lg"
          >
            <div>
              <span className="text-2xl">{SECTION_ICON[section.title] ?? "📁"}</span>
              <h2 className="mt-3 text-lg font-semibold text-[var(--fg-strong)] group-hover:text-[var(--accent)]">
                {section.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                {SECTION_BLURB[section.title] ?? ""}
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">{section.topicCount} トピック</span>
              <span className="text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
                見る →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
