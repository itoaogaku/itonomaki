"use client";

import { useEffect, useState } from "react";

type Topic = { slug: string; title: string };
type Section = { slug: string; title: string; topics: Topic[] };

const fieldClass =
  "mt-1 block w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]";

export function EditWorkspace({ sections }: { sections: Section[] }) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    fetch("/api/edit/auth")
      .then((res) => res.json())
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthChecked(true));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/edit/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error ?? "ログインに失敗しました");
        return;
      }
      setAuthenticated(true);
      setPassword("");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/edit/auth", { method: "DELETE" });
    setAuthenticated(false);
  }

  if (!authChecked) {
    return <p className="text-sm text-[var(--muted)]">読み込み中...</p>;
  }

  if (!authenticated) {
    return (
      <form onSubmit={handleLogin} className="max-w-sm space-y-3">
        <label className="block text-sm font-medium text-[var(--fg)]">
          編集用パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            autoFocus
          />
        </label>
        {loginError && <p className="text-sm text-red-500">{loginError}</p>}
        <button
          type="submit"
          disabled={loginLoading || !password}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50"
        >
          {loginLoading ? "確認中..." : "ログイン"}
        </button>
      </form>
    );
  }

  return <Editor sections={sections} onLogout={handleLogout} />;
}

function Editor({ sections, onLogout }: { sections: Section[]; onLogout: () => void }) {
  const [mode, setMode] = useState<"edit" | "create">("edit");
  const [sectionSlug, setSectionSlug] = useState(sections[0]?.slug ?? "");
  const currentSection = sections.find((s) => s.slug === sectionSlug);

  const [topicSlug, setTopicSlug] = useState(currentSection?.topics[0]?.slug ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSectionChange(nextSection: string) {
    setSectionSlug(nextSection);
    const topics = sections.find((s) => s.slug === nextSection)?.topics ?? [];
    setTopicSlug(topics[0]?.slug ?? "");
  }

  useEffect(() => {
    if (mode !== "edit" || !sectionSlug || !topicSlug) return;
    let cancelled = false;
    (async () => {
      setLoadingContent(true);
      setMessage(null);
      try {
        const res = await fetch(
          `/api/edit/content?section=${encodeURIComponent(sectionSlug)}&topic=${encodeURIComponent(topicSlug)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "内容の読み込みに失敗しました");
        if (!cancelled) setContentText(data.content ?? "");
      } catch (err) {
        if (!cancelled) {
          setContentText("");
          setMessage({ type: "error", text: err instanceof Error ? err.message : "内容の読み込みに失敗しました" });
        }
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, sectionSlug, topicSlug]);

  function switchMode(next: "edit" | "create") {
    setMode(next);
    setMessage(null);
    if (next === "create") {
      setNewTitle("");
      setContentText("");
    }
  }

  function handleNewTitleBlur() {
    const title = newTitle.trim();
    if (title && !contentText.trim()) {
      setContentText(`# ${title}\n\n`);
    }
  }

  async function handleSave() {
    const topic = mode === "create" ? newTitle.trim() : topicSlug;
    if (!topic || !contentText.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/edit/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: sectionSlug, topic, content: contentText, isNew: mode === "create" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "保存に失敗しました" });
        return;
      }
      setMessage({ type: "success", text: "保存しました。数十秒〜数分でサイトに反映されます。" });
      if (mode === "create") setNewTitle("");
    } catch {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          <button
            type="button"
            onClick={() => switchMode("edit")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              mode === "edit" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--fg)]"
            }`}
          >
            既存トピックを編集
          </button>
          <button
            type="button"
            onClick={() => switchMode("create")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              mode === "create" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--fg)]"
            }`}
          >
            新規トピック作成
          </button>
        </div>
        <button type="button" onClick={onLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          ログアウト
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-[var(--fg)]">
          カテゴリ
          <select value={sectionSlug} onChange={(e) => handleSectionChange(e.target.value)} className={fieldClass}>
            {sections.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        {mode === "edit" ? (
          <label className="block text-sm font-medium text-[var(--fg)]">
            トピック
            <select value={topicSlug} onChange={(e) => setTopicSlug(e.target.value)} className={fieldClass}>
              {(currentSection?.topics ?? []).map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm font-medium text-[var(--fg)]">
            新しいトピック名
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={handleNewTitleBlur}
              placeholder="例: 新しい項目名"
              className={fieldClass}
            />
          </label>
        )}
      </div>

      <label className="block text-sm font-medium text-[var(--fg)]">
        本文(Markdown)
        <textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          disabled={loadingContent}
          rows={24}
          className={`${fieldClass} font-mono disabled:opacity-50`}
          placeholder={loadingContent ? "読み込み中..." : undefined}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loadingContent || !contentText.trim() || (mode === "create" && !newTitle.trim())}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存して公開"}
        </button>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-[var(--accent)]" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
