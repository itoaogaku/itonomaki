"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

export type NavTopic = { slug: string; title: string };
export type NavSection = { slug: string; title: string; topics: NavTopic[] };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function topicHref(sectionSlug: string, topicSlug: string): string {
  return `/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(topicSlug)}`;
}

export function Sidebar({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  /** Called when a topic link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const decodedPath = safeDecode(pathname ?? "");
  const currentSectionSlug = decodedPath.split("/")[1] ?? "";

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(currentSectionSlug ? [currentSectionSlug] : [])
  );
  const [query, setQuery] = useState("");

  const toggle = (slug: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return sections
      .map((section) => ({
        ...section,
        topics: section.topics.filter((t) => t.title.toLowerCase().includes(q)),
      }))
      .filter((section) => section.topics.length > 0);
  }, [sections, query]);

  const visibleSections = filteredSections ?? sections;
  const isFiltering = filteredSections !== null;

  return (
    <nav
      className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--surface)]"
      aria-label="コンテンツ一覧"
    >
      <div className="border-b border-[var(--border)] p-3">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.2-3.2" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="トピックを検索"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1.5 pl-8 pr-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 py-2">
        {visibleSections.map((section) => {
          const isOpen = isFiltering || openSections.has(section.slug);
          return (
            <div key={section.slug} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(section.slug)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[0.8rem] font-semibold tracking-wide text-[var(--muted)] uppercase hover:bg-[var(--surface-2)]"
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    fill="currentColor"
                  >
                    <path d="M9 6l6 6-6 6V6z" />
                  </svg>
                  {section.title}
                </span>
                <span className="text-[0.7rem] font-normal text-[var(--muted)]">{section.topics.length}</span>
              </button>

              {isOpen && (
                <ul className="mt-0.5 mb-2 space-y-0.5">
                  {section.topics.map((topic) => {
                    const href = topicHref(section.slug, topic.slug);
                    const active = decodedPath === `/${section.slug}/${topic.slug}`;
                    return (
                      <li key={topic.slug}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          className={
                            "block truncate rounded-md py-1.5 pl-6 pr-2 text-[0.9rem] leading-tight transition-colors " +
                            (active
                              ? "bg-[var(--accent)]/12 font-medium text-[var(--accent)]"
                              : "text-[var(--fg)] hover:bg-[var(--surface-2)]")
                          }
                          title={topic.title}
                        >
                          {topic.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {isFiltering && visibleSections.length === 0 && (
          <p className="px-2 py-4 text-sm text-[var(--muted)]">一致するトピックがありません</p>
        )}
      </div>
    </nav>
  );
}
