import type { Metadata } from "next";
import { getSections, getTopics } from "@/lib/content";
import { EditWorkspace } from "@/components/EditWorkspace";

export const metadata: Metadata = { title: "編集" };

export default function EditPage() {
  const sections = getSections().map((section) => ({
    slug: section.slug,
    title: section.title,
    topics: getTopics(section.slug),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--fg-strong)] md:text-3xl">編集</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        既存トピックへの追記や、新しいトピックの追加ができます。保存すると自動でサイトに反映されます。
      </p>
      <div className="mt-8">
        <EditWorkspace sections={sections} />
      </div>
    </div>
  );
}
