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
import sys
import time
from pathlib import Path

import requests

from md_to_blocks import markdown_to_blocks

NOTION_VERSION = "2022-06-28"
API_BASE = "https://api.notion.com/v1"
CONTENT_DIR = Path(__file__).parent / "content"
HASH_PREFIX = "sync-hash:"


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


def clear_children(block_id):
    for child in get_children(block_id):
        notion_request("DELETE", f"/blocks/{child['id']}")


def append_blocks(block_id, blocks):
    for i in range(0, len(blocks), 100):
        notion_request("PATCH", f"/blocks/{block_id}/children", json={"children": blocks[i:i + 100]})


def ensure_page(parent_id, title):
    page_id = find_child_page(parent_id, title)
    if page_id is None:
        return create_page(parent_id, title), True
    return page_id, False


def content_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


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

    for section_dir in sorted(p for p in CONTENT_DIR.iterdir() if p.is_dir()):
        section_title = section_dir.name
        section_page_id, created = ensure_page(root_page_id, section_title)
        print(f"[section] {section_title} -> {section_page_id} ({'created' if created else 'existing'})")

        for md_file in sorted(section_dir.glob("*.md")):
            title = md_file.stem
            text = md_file.read_text(encoding="utf-8")
            new_hash = content_hash(text)
            topic_page_id, created = ensure_page(section_page_id, title)

            if not created and existing_hash(topic_page_id) == new_hash:
                print(f"  [topic] {title} -> {topic_page_id} (unchanged, skipped)")
                continue

            if not created:
                clear_children(topic_page_id)
            blocks = markdown_to_blocks(text)
            blocks.append(hash_marker_block(new_hash))
            append_blocks(topic_page_id, blocks)
            print(f"  [topic] {title} -> {topic_page_id} "
                  f"({'created' if created else 'updated'}, {len(blocks)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        sys.exit(f"Missing required environment variable: {e}")
