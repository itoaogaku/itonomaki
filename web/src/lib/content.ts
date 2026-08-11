import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "content");
const STARRED_FILE = path.join(process.cwd(), "starred.json");

export type SectionSummary = {
  slug: string;
  title: string;
  topicCount: number;
};

export type TopicSummary = {
  slug: string;
  title: string;
  starred: boolean;
};

/** Key format used in starred.json and the /api/edit/star request body. */
export function starredKey(sectionSlug: string, topicSlug: string): string {
  return `${sectionSlug}/${topicSlug}`;
}

function getStarredSet(): Set<string> {
  try {
    const list = JSON.parse(fs.readFileSync(STARRED_FILE, "utf-8"));
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export type TopicContent = TopicSummary & {
  sectionSlug: string;
  sectionTitle: string;
  raw: string;
};

/**
 * Route params for non-ASCII dynamic segments come through percent-encoded
 * at least during static generation on this Next.js version. Decoding an
 * already-decoded string (no "%" sequences) is a safe no-op, so callers can
 * always run params through this before looking anything up.
 */
export function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readDirSorted(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "ja"));
}

/** Section order as curated for the trainer knowledge base (not alphabetical). */
export const SECTION_ORDER = ["フィジカル", "メンタル", "部位別", "種目別", "トレーナー"];

function sortSections(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ja");
  });
}

export function getSections(): SectionSummary[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const dirNames = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return sortSections(dirNames).map((name) => {
    const topicFiles = fs
      .readdirSync(path.join(CONTENT_DIR, name))
      .filter((f) => f.endsWith(".md"));
    return { slug: name, title: name, topicCount: topicFiles.length };
  });
}

export function getSection(sectionSlug: string): SectionSummary | undefined {
  return getSections().find((s) => s.slug === sectionSlug);
}

/**
 * Topics pinned to the front of a section's list, in this order, ahead of
 * the rest of that section's topics (which stay in alphabetical order).
 */
const PINNED_TOPICS: Record<string, string[]> = {
  フィジカル: [
    "大会準備",
    "マラソン準備",
    "動的ストレッチ",
    "静的ストレッチ",
    "リカバリー",
    "リコンディショニング",
    "ランニング基礎",
    "持久力",
    "コアパフォーマンス",
    "血液検査",
    "自律神経",
    "睡眠",
    "食事",
    "運動連鎖",
    "ライン",
    "トレーニングポイント",
  ],
};

/** Starred topics sort first, then pinned topics (in PINNED_TOPICS order),
 *  then everything else alphabetically — each tier keeping that same order
 *  internally, so starring doesn't disturb the curated pinned ordering. */
function sortTopics(sectionSlug: string, fileNames: string[], starred: Set<string>): string[] {
  const pinned = PINNED_TOPICS[sectionSlug] ?? [];
  const slugOf = (fileName: string) => fileName.replace(/\.md$/, "");
  return [...fileNames].sort((a, b) => {
    const aStarred = starred.has(starredKey(sectionSlug, slugOf(a)));
    const bStarred = starred.has(starredKey(sectionSlug, slugOf(b)));
    if (aStarred !== bStarred) return aStarred ? -1 : 1;

    const ai = pinned.indexOf(slugOf(a));
    const bi = pinned.indexOf(slugOf(b));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ja");
  });
}

export function getTopics(sectionSlug: string): TopicSummary[] {
  const dir = path.join(CONTENT_DIR, sectionSlug);
  if (!fs.existsSync(dir)) return [];
  const starred = getStarredSet();
  const files = sortTopics(sectionSlug, readDirSorted(dir).filter((f) => f.endsWith(".md")), starred);
  return files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    return { slug, title: slug, starred: starred.has(starredKey(sectionSlug, slug)) };
  });
}

export function getTopic(sectionSlug: string, topicSlug: string): TopicContent | undefined {
  const section = getSection(sectionSlug);
  if (!section) return undefined;
  const filePath = path.join(CONTENT_DIR, sectionSlug, `${topicSlug}.md`);
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf-8");
  return {
    slug: topicSlug,
    title: topicSlug,
    starred: getStarredSet().has(starredKey(sectionSlug, topicSlug)),
    sectionSlug,
    sectionTitle: section.title,
    raw,
  };
}

export function getAllTopicParams(): { section: string; topic: string }[] {
  return getSections().flatMap((section) =>
    getTopics(section.slug).map((topic) => ({ section: section.slug, topic: topic.slug }))
  );
}

/** Flat index across every section, used for the sidebar search filter. */
export function getSearchIndex(): { sectionSlug: string; sectionTitle: string; slug: string; title: string }[] {
  return getSections().flatMap((section) =>
    getTopics(section.slug).map((topic) => ({
      sectionSlug: section.slug,
      sectionTitle: section.title,
      slug: topic.slug,
      title: topic.title,
    }))
  );
}
