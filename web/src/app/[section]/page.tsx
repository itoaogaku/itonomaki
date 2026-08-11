import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { decodeSlug, getSection, getSections, getTopics } from "@/lib/content";

export function generateStaticParams() {
  return getSections().map((section) => ({ section: section.slug }));
}

export async function generateMetadata(
  props: PageProps<"/[section]">
): Promise<Metadata> {
  const { section: sectionSlug } = await props.params;
  const section = getSection(decodeSlug(sectionSlug));
  return { title: section?.title ?? "Not Found" };
}

export default async function SectionPage(props: PageProps<"/[section]">) {
  const { section: sectionSlug } = await props.params;
  const section = getSection(decodeSlug(sectionSlug));
  if (!section) notFound();

  const topics = getTopics(section.slug);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8 md:py-14">
      <nav className="text-sm text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--accent)]">
          トップ
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--fg)]">{section.title}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--fg-strong)] md:text-3xl">
        {section.title}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{topics.length} トピック</p>

      <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={`/${encodeURIComponent(section.slug)}/${encodeURIComponent(topic.slug)}`}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[0.95rem] font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
            >
              {topic.starred && <span aria-hidden>⭐️</span>}
              <span className="truncate">{topic.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
