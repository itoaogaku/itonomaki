"use client";

import { useEffect } from "react";

/**
 * When arriving from a sidebar search result that matched body text (not the
 * title), the URL carries `?q=<query>`. On mount, find the first text node
 * under `containerId` containing that query, scroll it into view, and flash
 * it briefly so the reader can locate the match without rereading the page.
 * Reads location.search directly (rather than useSearchParams) so this runs
 * with no Suspense boundary needed on an otherwise fully static page.
 */
export function ScrollToMatch({ containerId }: { containerId: string }) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    const needle = q.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.toLowerCase().includes(needle)) {
        const el = node.parentElement;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-match-flash");
          setTimeout(() => el.classList.remove("search-match-flash"), 2200);
        }
        break;
      }
    }

    window.history.replaceState(null, "", window.location.pathname);
  }, [containerId]);

  return null;
}
