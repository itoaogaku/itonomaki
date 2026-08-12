import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { decodeSlug, getAllTopicParams, getSection, getTopic, getTopics } from "@/lib/content";
import { parseMarkdown } from "@/lib/markdown";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ScrollToMatch } from "@/components/ScrollToMatch";
import { StarButton } from "@/components/StarButton";
import { PrintButton } from "@/components/PrintButton";
import { TableOfContents } from "@/components/TableOfContents";

export function generateStaticParams() {
  return getAllTopicParams();
}

export async function generateMetadata(
  props: PageProps<"/[section]/[topic]">
): Promise<Metadata> {
  const { section, topic } = await props.params;
  const data = getTopic(decodeSlug(section), decodeSlug(topic));
  return { title: data?.title ?? "Not Found" };
}

export default async function TopicPage(props: PageProps<"/[section]/[topic]">) {
  const sectionSlug = decodeSlug((await props.params).section);
  const topicSlug = decodeSlug((await props.params).topic);
  const topic = getTopic(sectionSlug, topicSlug);
  if (!topic) notFound();

  const section = getSection(sectionSlug);
  const siblings = getTopics(sectionSlug);
  const index = siblings.findIndex((t) => t.slug === topicSlug);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  const blocks = parseMarkdown(topic.raw, `/images/${encodeURIComponent(sectionSlug)}/`);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14">
      <nav className="text-sm text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--accent)]">
          トップ
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${encodeURIComponent(sectionSlug)}`} className="hover:text-[var(--accent)]">
          {section?.title ?? sectionSlug}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--fg)]">{topic.title}</span>
      </nav>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg-strong)] md:text-3xl">{topic.title}</h1>
        <StarButton section={sectionSlug} topic={topicSlug} initialStarred={topic.starred} />
        <PrintButton />
      </div>

      <TableOfContents blocks={blocks} />

      <article id="topic-article" className="mt-6">
        <MarkdownContent blocks={blocks} />
      </article>
      <ScrollToMatch containerId="topic-article" />

      {(prev || next) && (
        <div className="mt-12 grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-2 print:hidden">
          {prev ? (
            <Link
              href={`/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(prev.slug)}`}
              className="rounded-xl border border-[var(--border)] px-4 py-3 transition-colors hover:border-[var(--accent)]/50"
            >
              <div className="text-xs text-[var(--muted)]">← 前へ</div>
              <div className="mt-0.5 truncate font-medium text-[var(--fg)]">{prev.title}</div>
            </Link>
          ) : (
            <div />
          )}
          {next && (
            <Link
              href={`/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(next.slug)}`}
              className="rounded-xl border border-[var(--border)] px-4 py-3 text-right transition-colors hover:border-[var(--accent)]/50 sm:col-start-2"
            >
              <div className="text-xs text-[var(--muted)]">次へ →</div>
              <div className="mt-0.5 truncate font-medium text-[var(--fg)]">{next.title}</div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
