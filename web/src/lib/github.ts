// Reads/writes topic Markdown directly via the GitHub Contents API, so the
// web editor (src/app/edit) can publish without any local git checkout or
// database — a commit to this repo *is* the save. Requires a GITHUB_TOKEN
// with contents:write on this repo.
const GITHUB_API = "https://api.github.com";
const OWNER = "itoaogaku";
const REPO = "itonomaki";
const CONTENT_PREFIX = "notion_sync/content";

/** The branch Vercel deployed this instance from, so edits land wherever the
 *  site itself is being served from (production branch in prod, the preview
 *  branch on a preview deploy). Falls back to EDIT_TARGET_BRANCH for local
 *  dev, where Vercel's branch env var isn't set. */
function targetBranch(): string {
  return process.env.VERCEL_GIT_COMMIT_REF || process.env.EDIT_TARGET_BRANCH || "main";
}

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentsUrlForPath(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${encodedPath}`;
}

function contentPath(section: string, topic: string): string {
  return `${CONTENT_PREFIX}/${section}/${topic}.md`;
}

export type RemoteFile = { content: string; sha: string };

/** Fetches a file straight from GitHub (not the local build's copy, which
 *  may be stale between deploys). Returns null if it doesn't exist yet. */
export async function getFileAtPath(path: string): Promise<RemoteFile | null> {
  const res = await fetch(`${contentsUrlForPath(path)}?ref=${targetBranch()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
}

/** Creates or updates a file with a single commit. Pass the sha from a
 *  just-fetched getFileAtPath() when updating (GitHub rejects the write
 *  otherwise); omit it when creating a new file. */
export async function putFileAtPath(
  path: string,
  content: string,
  sha: string | null,
  message: string
): Promise<void> {
  const res = await fetch(contentsUrlForPath(path), {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: targetBranch(),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
}

export function getFile(section: string, topic: string): Promise<RemoteFile | null> {
  return getFileAtPath(contentPath(section, topic));
}

export function putFile(
  section: string,
  topic: string,
  content: string,
  sha: string | null,
  message: string
): Promise<void> {
  return putFileAtPath(contentPath(section, topic), content, sha, message);
}
