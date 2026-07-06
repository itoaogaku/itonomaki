"""Sync Markdown files under notion_sync/content/<section>/<topic>.md to Notion.

Structure created in Notion:
  <parent page>
    - <section page>       (one per subdirectory of content/)
      - <topic page>       (one per .md file, content replaced on every run)

Required environment variables:
  NOTION_TOKEN            Notion internal integration secret
  NOTION_PARENT_PAGE_ID   Page ID that the integration has been shared with
"""
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

from md_to_blocks import markdown_to_blocks, parse_inline, PARSER_VERSION

NOTION_VERSION = "2022-06-28"
API_BASE = "https://api.notion.com/v1"
CONTENT_DIR = Path(__file__).parent / "content"
HASH_PREFIX = "sync-hash:"

# Headless Chromium used to rasterize our source .svg illustrations to .png
# before uploading, since Notion's image block does not reliably render svg.
CHROMIUM_BIN = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PNG_CACHE_DIR = Path(__file__).parent / ".svg_render_cache"

# Maps (section, new topic title) -> [old titles the page may still exist under
# in Notion]. When a local .md file is renamed, add an entry here so the
# existing Notion page is renamed in place instead of leaving an orphaned
# duplicate under its old title. When multiple old titles are listed (e.g. two
# topics merged into one), the first found is renamed and any others found are
# archived, since their content has already been merged into the new file.
# Safe to remove an entry once the rename/merge has been applied (subsequent
# runs find the page by its new title directly).
RENAMES = {
    ("フィジカル", "睡眠"): ["睡眠について"],
    ("フィジカル", "リコンディショニング"): ["リコンディショニング①", "リコンディショニング②"],
    ("フィジカル", "ランニング基礎"): ["ランニング"],
    ("フィジカル", "コアパフォーマンス"): ["コアパフォーマンストレーニング"],
    ("フィジカル", "持久力"): ["スピード"],
    ("フィジカル", "痛み"): ["痛み【アスリート】", "痛み【一般】", "痛み【心因性】"],
}

# Maps (old_section, title) -> a human-readable note on where the content
# went, for topics whose local file moved to a different section's directory
# (or was merged into a different, already-existing topic elsewhere). Either
# way the destination page is found/created/updated normally via its own
# directory scan (see main()); this only archives the leftover page under the
# OLD section so it doesn't stay behind as an orphaned duplicate. Safe to
# remove an entry once applied (subsequent runs find no old page to archive).
MOVES = {
    ("フィジカル", "レイヤートレーニング"): "種目別",
    ("フィジカル", "再生医療"): "トレーナー",
    ("フィジカル", "神経"): "トレーナー",
    ("フィジカル", "慢性腎臓病"): "トレーナー",
    ("フィジカル", "キッズ"): "トレーナー(子どもの運動に統合)",
}


def _headers():
    return {
        "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_request(method, path, **kwargs):
    url = f"{API_BASE}{path}"
    for attempt in range(8):
        try:
            resp = requests.request(method, url, headers=_headers(), timeout=60, **kwargs)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            wait = min(2 ** attempt, 30)
            print(f"  (network error on {method} {path}: {exc}; retrying in {wait}s)")
            time.sleep(wait)
            continue
        if resp.status_code == 429:
            time.sleep(int(resp.headers.get("Retry-After", "1")))
            continue
        if resp.status_code >= 500:
            wait = min(2 ** attempt, 30)
            print(f"  (server error {resp.status_code} on {method} {path}; retrying in {wait}s)")
            time.sleep(wait)
            continue
        if resp.status_code >= 400:
            raise RuntimeError(f"Notion API error {resp.status_code} on {method} {path}: {resp.text}")
        return resp.json() if resp.text else {}
    raise RuntimeError(f"Too many retries for {method} {path}")


def get_children(block_id):
    children = []
    cursor = None
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        data = notion_request("GET", f"/blocks/{block_id}/children", params=params)
        children.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
    return children


def find_child_page(parent_id, title):
    for child in get_children(parent_id):
        if child["type"] == "child_page" and child["child_page"]["title"] == title:
            return child["id"]
    return None


def create_page(parent_id, title):
    body = {
        "parent": {"page_id": parent_id},
        "properties": {"title": {"title": [{"type": "text", "text": {"content": title}}]}},
    }
    return notion_request("POST", "/pages", json=body)["id"]


def rename_page(page_id, new_title):
    body = {"properties": {"title": {"title": [{"type": "text", "text": {"content": new_title}}]}}}
    notion_request("PATCH", f"/pages/{page_id}", json=body)


def archive_page(page_id):
    notion_request("PATCH", f"/pages/{page_id}", json={"archived": True})


def clear_children(block_id):
    for child in get_children(block_id):
        notion_request("DELETE", f"/blocks/{child['id']}")


def append_blocks(block_id, blocks):
    for i in range(0, len(blocks), 100):
        notion_request("PATCH", f"/blocks/{block_id}/children", json={"children": blocks[i:i + 100]})


def ensure_page(parent_id, title, old_titles=None):
    page_id = find_child_page(parent_id, title)
    if page_id is not None:
        # Clean up any leftover old-titled duplicates (e.g. a previous run's
        # merge was interrupted before archiving them all).
        for old_title in old_titles or []:
            old_page_id = find_child_page(parent_id, old_title)
            if old_page_id is not None and old_page_id != page_id:
                archive_page(old_page_id)
                print(f"  [topic] archived leftover duplicate '{old_title}'")
        return page_id, False

    renamed_page_id = None
    for old_title in old_titles or []:
        old_page_id = find_child_page(parent_id, old_title)
        if old_page_id is None:
            continue
        if renamed_page_id is None:
            rename_page(old_page_id, title)
            renamed_page_id = old_page_id
            print(f"  [topic] renamed '{old_title}' -> '{title}'")
        else:
            archive_page(old_page_id)
            print(f"  [topic] archived leftover duplicate '{old_title}'")
    if renamed_page_id is not None:
        return renamed_page_id, False

    return create_page(parent_id, title), True


def svg_to_png(svg_path):
    """Rasterize an .svg to .png via headless Chromium, cached by mtime+size."""
    PNG_CACHE_DIR.mkdir(exist_ok=True)
    stat = svg_path.stat()
    cache_key = hashlib.sha256(f"{svg_path}:{stat.st_mtime}:{stat.st_size}".encode()).hexdigest()[:16]
    png_path = PNG_CACHE_DIR / f"{cache_key}.png"
    if png_path.exists():
        return png_path
    subprocess.run(
        [
            CHROMIUM_BIN, "--headless", "--disable-gpu", "--no-sandbox",
            "--disable-software-rasterizer", "--hide-scrollbars",
            f"--screenshot={png_path}", "--window-size=1000,1000",
            "--default-background-color=00000000",
            svg_path.resolve().as_uri(),
        ],
        check=True, capture_output=True, timeout=30,
    )
    return png_path


def upload_file_to_notion(path):
    create_resp = notion_request("POST", "/file_uploads", json={"filename": path.name})
    upload_id, upload_url = create_resp["id"], create_resp["upload_url"]
    with open(path, "rb") as f:
        resp = requests.post(
            upload_url,
            headers={
                "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
                "Notion-Version": NOTION_VERSION,
            },
            files={"file": (path.name, f, "image/png")},
            timeout=60,
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Notion file upload send failed {resp.status_code}: {resp.text}")
    return upload_id


def make_image_resolver(md_dir):
    def resolve_image(alt, rel_path):
        svg_path = (md_dir / rel_path).resolve()
        if not svg_path.exists():
            print(f"  [warn] image not found, skipping: {svg_path}")
            return None
        png_path = svg_to_png(svg_path) if svg_path.suffix.lower() == ".svg" else svg_path
        upload_id = upload_file_to_notion(png_path)
        return {
            "object": "block",
            "type": "image",
            "image": {
                "type": "file_upload",
                "file_upload": {"id": upload_id},
                "caption": parse_inline(alt) if alt else [],
            },
        }
    return resolve_image


def content_hash(text):
    salted = f"{PARSER_VERSION}:{text}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()[:16]


def existing_hash(page_id):
    """Read the sync-hash marker left on a page by a previous run, if any."""
    children = get_children(page_id)
    if not children:
        return None
    last = children[-1]
    if last["type"] != "paragraph":
        return None
    texts = last["paragraph"].get("rich_text", [])
    if not texts:
        return None
    content = texts[0].get("plain_text", texts[0].get("text", {}).get("content", ""))
    if content.startswith(HASH_PREFIX):
        return content[len(HASH_PREFIX):].strip()
    return None


def hash_marker_block(hash_value):
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [{
                "type": "text",
                "text": {"content": f"{HASH_PREFIX} {hash_value}"},
                "annotations": {"color": "gray"},
            }]
        },
    }


def main():
    root_page_id = os.environ["NOTION_PARENT_PAGE_ID"]

    if not CONTENT_DIR.exists():
        print(f"No content directory at {CONTENT_DIR}, nothing to sync.")
        return

    section_page_ids = {}
    for section_dir in sorted(p for p in CONTENT_DIR.iterdir() if p.is_dir()):
        section_title = section_dir.name
        section_page_id, created = ensure_page(root_page_id, section_title)
        section_page_ids[section_title] = section_page_id
        print(f"[section] {section_title} -> {section_page_id} ({'created' if created else 'existing'})")

        for md_file in sorted(section_dir.glob("*.md")):
            title = md_file.stem
            text = md_file.read_text(encoding="utf-8")
            new_hash = content_hash(text)
            old_titles = RENAMES.get((section_title, title))
            topic_page_id, created = ensure_page(section_page_id, title, old_titles)

            if not created and existing_hash(topic_page_id) == new_hash:
                print(f"  [topic] {title} -> {topic_page_id} (unchanged, skipped)")
                continue

            if not created:
                clear_children(topic_page_id)
            blocks = markdown_to_blocks(text, resolve_image=make_image_resolver(md_file.parent))
            blocks.append(hash_marker_block(new_hash))
            append_blocks(topic_page_id, blocks)
            print(f"  [topic] {title} -> {topic_page_id} "
                  f"({'created' if created else 'updated'}, {len(blocks)} blocks)")

    for (old_section, title), new_section in MOVES.items():
        old_section_page_id = section_page_ids.get(old_section) or find_child_page(root_page_id, old_section)
        if old_section_page_id is None:
            continue
        old_topic_page_id = find_child_page(old_section_page_id, title)
        if old_topic_page_id is None:
            continue
        archive_page(old_topic_page_id)
        print(f"[move] archived '{title}' under old section '{old_section}' (now in '{new_section}')")


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        sys.exit(f"Missing required environment variable: {e}")
