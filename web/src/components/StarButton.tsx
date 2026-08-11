"use client";

import { useEffect, useState } from "react";

/**
 * Marks a topic as "done" with a ⭐️. Anyone viewing the site sees the star
 * when set; only someone logged into the editor (same session as /edit) can
 * toggle it, directly from the topic page rather than through the editor.
 */
export function StarButton({ section, topic, initialStarred }: { section: string; topic: string; initialStarred: boolean }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [starred, setStarred] = useState(initialStarred);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/edit/auth")
      .then((res) => res.json())
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  async function toggle() {
    if (saving) return;
    const next = !starred;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/edit/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, topic, starred: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setStarred(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (!authenticated) {
    return starred ? (
      <span aria-label="完成" title="完成したページ" className="text-xl leading-none">
        ⭐️
      </span>
    ) : null;
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        title={starred ? "完成マークを外す" : "完成としてマークする"}
        className="text-xl leading-none disabled:opacity-50"
      >
        {starred ? "⭐️" : "☆"}
      </button>
      {error && (
        <span className="absolute top-full left-0 z-10 mt-1 w-max max-w-xs rounded-md bg-[var(--surface)] p-2 text-xs text-red-500 shadow-lg ring-1 ring-[var(--border)]">
          {error}
        </span>
      )}
    </span>
  );
}
