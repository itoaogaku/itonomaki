"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar, type NavSection } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

/** Points 編集 at whichever topic/section is currently being viewed, so
 *  pressing it opens the editor already on that topic instead of always
 *  defaulting to the first one. Falls back to a bare `/edit` on pages that
 *  aren't a known section/topic (home, the editor itself, etc). */
function useEditHref(sections: NavSection[]): string {
  const pathname = usePathname() ?? "";
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // malformed percent-encoding — fall through with the raw pathname
  }
  const [, sectionSlug, topicSlug] = decoded.split("/");
  const section = sections.find((s) => s.slug === sectionSlug);
  if (!section) return "/edit";

  const topic = topicSlug ? section.topics.find((t) => t.slug === topicSlug) : undefined;
  const params = new URLSearchParams({ section: section.slug, ...(topic ? { topic: topic.slug } : {}) });
  return `/edit?${params.toString()}`;
}

export function AppShell({
  sections,
  children,
}: {
  sections: NavSection[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const editHref = useEditHref(sections);

  return (
    <div className="flex min-h-screen">
      <div className="hidden md:block md:w-72 md:shrink-0 print:hidden">
        <div className="sticky top-0 h-screen">
          <Sidebar sections={sections} />
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-80 shadow-2xl">
            <Sidebar sections={sections} onNavigate={closeMobile} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-3 backdrop-blur md:px-8 print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="メニューを開く"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg)] hover:bg-[var(--surface-2)] md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--fg-strong)]">
            <span className="text-lg">💪</span>
            <span className="truncate">青トレ(基礎知識)</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={editHref}
              aria-label="編集"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg)] hover:bg-[var(--surface-2)]"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                />
              </svg>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
