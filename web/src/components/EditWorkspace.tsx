"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Topic = { slug: string; title: string };
type Section = { slug: string; title: string; topics: Topic[] };

const fieldClass =
  "mt-1 block w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]";

type ImageLine = { lineIndex: number; alt: string; url: string };

// Only whole-line images (`![alt](url)` with nothing else on the line) are
// treated as reorderable — this covers photo-gallery style topics without
// risking mangling images that sit inline within a paragraph.
const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;

function parseImageLines(text: string): ImageLine[] {
  const result: ImageLine[] = [];
  text.split("\n").forEach((line, lineIndex) => {
    const match = IMAGE_LINE_PATTERN.exec(line.trim());
    if (match) result.push({ lineIndex, alt: match[1], url: match[2] });
  });
  return result;
}

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
  // Editor only ever mounts client-side (after the auth check resolves), so
  // reading location.search here can't cause a hydration mismatch. The
  // 編集 button in the header links here with ?section=&topic= for whatever
  // topic was being viewed, rather than always opening the first one.
  const [sectionSlug, setSectionSlug] = useState(() => {
    if (typeof window === "undefined") return sections[0]?.slug ?? "";
    const requested = new URLSearchParams(window.location.search).get("section");
    return requested && sections.some((s) => s.slug === requested) ? requested : sections[0]?.slug ?? "";
  });
  const currentSection = sections.find((s) => s.slug === sectionSlug);

  const [topicSlug, setTopicSlug] = useState(() => {
    if (typeof window === "undefined") return currentSection?.topics[0]?.slug ?? "";
    const requested = new URLSearchParams(window.location.search).get("topic");
    return requested && currentSection?.topics.some((t) => t.slug === requested)
      ? requested
      : (currentSection?.topics[0]?.slug ?? "");
  });
  const [newTitle, setNewTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [rotatingIdx, setRotatingIdx] = useState<number | null>(null);
  const [justRotatedIdx, setJustRotatedIdx] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const imageLines = useMemo(() => parseImageLines(contentText), [contentText]);

  // Rewrites only the line slots that already held an image, in their new
  // order — leaves any surrounding text untouched.
  function reorderImages(newOrder: ImageLine[]) {
    const lines = contentText.split("\n");
    const slots = imageLines.map((im) => im.lineIndex);
    newOrder.forEach((im, i) => {
      lines[slots[i]] = `![${im.alt}](${im.url})`;
    });
    setContentText(lines.join("\n"));
  }

  function handleImageDrop(targetIdx: number) {
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      return;
    }
    const next = [...imageLines];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(targetIdx, 0, moved);
    reorderImages(next);
    setDraggedIdx(null);
  }

  // For removing broken (e.g. 404ing) entries, or ones just not wanted
  // anymore. Like reordering, this only edits the draft — 保存して公開 is
  // still required to publish the removal.
  function handleRemoveImage(index: number) {
    const target = imageLines[index];
    if (!target) return;
    if (!window.confirm("この写真を本文から削除しますか?(サーバー上の画像ファイル自体は削除されません)")) return;
    const lines = contentText.split("\n");
    lines.splice(target.lineIndex, 1);
    setContentText(lines.join("\n"));
  }

  // Rotation uploads the result under a new filename rather than overwriting
  // the original (Xserver's edge cache can hold the old bytes for a URL
  // indefinitely), so it swaps the markdown to the new URL like any other
  // edit. When editing an existing topic this is then auto-published right
  // away (a "rotate" button that silently requires a separate save click is
  // exactly the kind of step that gets missed); for a not-yet-created topic
  // (mode === "create") there's no topic to save to yet, so it just updates
  // the draft and 保存して公開 is still required.
  async function handleRotateImage(index: number) {
    const target = imageLines[index];
    if (!target) return;
    setRotatingIdx(index);
    setMessage(null);
    try {
      const res = await fetch("/api/edit/rotate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "画像の回転に失敗しました");
      const lines = contentText.split("\n");
      lines[target.lineIndex] = `![${target.alt}](${data.url})`;
      const nextContent = lines.join("\n");
      setContentText(nextContent);

      if (mode === "edit" && topicSlug) {
        const saveRes = await fetch("/api/edit/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: sectionSlug, topic: topicSlug, content: nextContent, isNew: false }),
        });
        const saveData = await saveRes.json().catch(() => ({}));
        if (!saveRes.ok) throw new Error(saveData.error ?? "回転した画像の保存に失敗しました");
        setMessage({ type: "success", text: "画像を回転して保存しました。数十秒〜数分でサイトに反映されます。" });
      } else {
        setMessage({ type: "success", text: "画像を回転しました。「保存して公開」を押すと反映されます。" });
      }
      // A brief on-thumbnail checkmark, since the grid can be tall enough
      // (100+ photos) that the message banner further down the page is
      // easy to miss entirely.
      setJustRotatedIdx(index);
      setTimeout(() => setJustRotatedIdx((cur) => (cur === index ? null : cur)), 2000);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "画像の回転に失敗しました" });
    } finally {
      setRotatingIdx(null);
    }
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setContentText((prev) => prev + text);
      return;
    }
    // Multiple images uploaded in one batch call this several times in
    // quick succession, well before React re-renders in between — reading
    // `contentText` here would see the same stale value every time and each
    // insertion would clobber the last. The functional update form always
    // sees the true latest state.
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setContentText((prev) => prev.slice(0, start) + text + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Uploads are sequential (not parallel) so the FTP server isn't hit with
  // concurrent connections, and so progress ("2/5枚") is easy to report.
  async function handleImageUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploadingImage(true);
    setMessage(null);
    let uploaded = 0;
    try {
      for (const file of fileArray) {
        setUploadProgress({ done: uploaded, total: fileArray.length });
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/edit/upload-image", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${file.name}: ${data.error ?? "画像のアップロードに失敗しました"}`);
        insertAtCursor(`![](${data.url})\n`);
        uploaded += 1;
      }
      if (fileArray.length > 1) {
        setMessage({ type: "success", text: `${fileArray.length}枚アップロードしました` });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "画像のアップロードに失敗しました";
      setMessage({ type: "error", text: uploaded > 0 ? `${uploaded}枚アップロード後にエラー: ${detail}` : detail });
    } finally {
      setUploadingImage(false);
      setUploadProgress(null);
    }
  }

  async function handlePdfUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploadingPdf(true);
    setMessage(null);
    let uploaded = 0;
    try {
      for (const file of fileArray) {
        setPdfUploadProgress({ done: uploaded, total: fileArray.length });
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/edit/upload-pdf", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${file.name}: ${data.error ?? "PDFのアップロードに失敗しました"}`);
        insertAtCursor(`[${data.name ?? file.name}](${data.url})\n`);
        uploaded += 1;
      }
      if (fileArray.length > 1) {
        setMessage({ type: "success", text: `${fileArray.length}件のPDFをアップロードしました` });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "PDFのアップロードに失敗しました";
      setMessage({ type: "error", text: uploaded > 0 ? `${uploaded}件アップロード後にエラー: ${detail}` : detail });
    } finally {
      setUploadingPdf(false);
      setPdfUploadProgress(null);
    }
  }

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

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-[var(--fg)]">本文(Markdown)</label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--accent)]">
              {uploadingImage
                ? `アップロード中... (${uploadProgress ? uploadProgress.done + 1 : 1}/${uploadProgress?.total ?? 1})`
                : "📷 写真を追加(複数選択可)"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingImage}
                className="hidden"
                onChange={(e) => {
                  // Detach from the live FileList before resetting the input
                  // below — resetting .value clears the FileList in place in
                  // some browsers, which would silently empty this reference
                  // too if it weren't copied out first.
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length > 0) handleImageUpload(files);
                }}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--accent)]">
              {uploadingPdf
                ? `アップロード中... (${pdfUploadProgress ? pdfUploadProgress.done + 1 : 1}/${pdfUploadProgress?.total ?? 1})`
                : "📄 PDFを追加(複数選択可)"}
              <input
                type="file"
                accept="application/pdf"
                multiple
                disabled={uploadingPdf}
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length > 0) handlePdfUpload(files);
                }}
              />
            </label>
          </div>
        </div>

        {imageLines.length > 0 && (
          <div className="mt-3 rounded-md border border-[var(--border)] p-3">
            <p className="text-xs text-[var(--muted)]">
              ドラッグして写真の順番を入れ替え、右上の×で削除できます(どちらも反映には「保存して公開」を押してください)。回転ボタンは90度ずつ回転し、既存トピックの編集中はボタンを押すとすぐに保存・公開されます。
            </p>
            <div className="mt-2 grid max-h-96 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
              {imageLines.map((im, i) => (
                <div
                  key={`${im.url}-${i}`}
                  draggable
                  onDragStart={() => setDraggedIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleImageDrop(i)}
                  className={`group relative cursor-move overflow-hidden rounded-md border ${
                    draggedIdx === i ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote-hosted library photo, no need for next/image optimization */}
                  <img src={im.url} alt="" className="aspect-square w-full object-cover" />
                  {justRotatedIdx === i && (
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-600/80 text-2xl text-white">
                      ✓
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(i)}
                    aria-label="この写真を削除"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-xs text-white"
                  >
                    ×
                  </button>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1.5 py-0.5">
                    <span className="text-[10px] text-white">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRotateImage(i)}
                      disabled={rotatingIdx === i}
                      aria-label="90度回転"
                      className="text-xs text-white disabled:opacity-50"
                    >
                      {rotatingIdx === i ? "..." : "↻"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          disabled={loadingContent}
          rows={24}
          className={`${fieldClass} font-mono disabled:opacity-50`}
          placeholder={loadingContent ? "読み込み中..." : undefined}
        />
      </div>

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

      {/* Fixed so it's visible immediately regardless of scroll position —
          the page can be very long (e.g. 100+ photo thumbnails above the
          textarea), and the inline message above is easy to never see. */}
      {message && (
        <div
          className={`fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-md px-4 py-2 text-sm text-white shadow-lg ${
            message.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
