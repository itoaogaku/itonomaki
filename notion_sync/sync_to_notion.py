"""Sync Markdown files under notion_sync/content/<section>/<topic>.md to Notion.

Structure created in Notion:
  <parent page>
    - <section page>       (one per subdirectory of content/)
      - <topic page>       (one per .md file, content replaced on every run)

Required environment variables:
  NOTION_TOKEN            Notion internal integration secret
  NOTION_PARENT_PAGE_ID   Page ID that the integration has been shared with
"""
import os
import sys
import time
from pathlib import Path

import requests

from md_to_blocks import markdown_to_blocks

NOTION_VERSION = "2022-06-28"
API_BASE = "https://api.notion.com/v1"
CONTENT_DIR = Path(__file__).parent / "content"


def _headers():
    return {
        "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_request(method, path, **kwargs):
    url = f"{API_BASE}{path}"
    for attempt in range(5):
        resp = requests.request(method, url, headers=_headers(), timeout=30, **kwargs)
        if resp.status_code == 429:
            time.sleep(int(resp.headers.get("Retry-After", "1")))
            continue
        if resp.status_code >= 400:
            raise RuntimeError(f"Notion API error {resp.status_code} on {method} {path}: {resp.text}")
        return resp.json()
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


def ensure_page(parent_id, title, replace_content=False):
    page_id = find_child_page(parent_id, title)
    if page_id is None:
        return create_page(parent_id, title), True
    if replace_content:
        clear_children(page_id)
    return page_id, False


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
            blocks = markdown_to_blocks(md_file.read_text(encoding="utf-8"))
            topic_page_id, created = ensure_page(section_page_id, title, replace_content=True)
            append_blocks(topic_page_id, blocks)
            print(f"  [topic] {title} -> {topic_page_id} "
                  f"({'created' if created else 'updated'}, {len(blocks)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        sys.exit(f"Missing required environment variable: {e}")
