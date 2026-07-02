"""Convert a lightweight Markdown subset into Notion API block objects."""
import re

INLINE_PATTERN = re.compile(r"(\*\*.+?\*\*|`.+?`)")


def parse_inline(text):
    tokens = []
    for part in INLINE_PATTERN.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            tokens.append({
                "type": "text",
                "text": {"content": part[2:-2]},
                "annotations": {"bold": True},
            })
        elif part.startswith("`") and part.endswith("`"):
            tokens.append({
                "type": "text",
                "text": {"content": part[1:-1]},
                "annotations": {"code": True},
            })
        else:
            tokens.append({"type": "text", "text": {"content": part}})
    if not tokens:
        tokens = [{"type": "text", "text": {"content": ""}}]
    return tokens


def _table_row(cells):
    return {
        "object": "block",
        "type": "table_row",
        "table_row": {"cells": [parse_inline(c.strip()) for c in cells]},
    }


def markdown_to_blocks(md_text):
    lines = md_text.split("\n")
    blocks = []
    table_buffer = []

    def flush_table():
        nonlocal table_buffer
        if not table_buffer:
            return
        header, *rows = table_buffer
        rows = [r for r in rows if not re.match(r"^[\s:|-]+$", "".join(r))]
        blocks.append({
            "object": "block",
            "type": "table",
            "table": {
                "table_width": len(header),
                "has_column_header": True,
                "has_row_header": False,
                "children": [_table_row(header)] + [_table_row(r) for r in rows],
            },
        })
        table_buffer = []

    for raw_line in lines:
        stripped = raw_line.strip()

        if stripped.startswith("|") and stripped.endswith("|"):
            table_buffer.append([c.strip() for c in stripped.strip("|").split("|")])
            continue
        flush_table()

        if not stripped:
            continue

        if stripped.startswith("### "):
            blocks.append({"object": "block", "type": "heading_3",
                            "heading_3": {"rich_text": parse_inline(stripped[4:])}})
        elif stripped.startswith("## "):
            blocks.append({"object": "block", "type": "heading_2",
                            "heading_2": {"rich_text": parse_inline(stripped[3:])}})
        elif stripped.startswith("# "):
            blocks.append({"object": "block", "type": "heading_1",
                            "heading_1": {"rich_text": parse_inline(stripped[2:])}})
        elif stripped == "---":
            blocks.append({"object": "block", "type": "divider", "divider": {}})
        elif stripped.startswith(">"):
            content = stripped.lstrip(">").strip()
            icon = "⚠️" if content.startswith("⚠️") else "💡"
            blocks.append({
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": parse_inline(content),
                    "icon": {"type": "emoji", "emoji": icon},
                },
            })
        elif re.match(r"^- \[ \] ", stripped):
            blocks.append({"object": "block", "type": "to_do",
                            "to_do": {"rich_text": parse_inline(stripped[6:]), "checked": False}})
        elif re.match(r"^- \[[xX]\] ", stripped):
            blocks.append({"object": "block", "type": "to_do",
                            "to_do": {"rich_text": parse_inline(stripped[6:]), "checked": True}})
        elif re.match(r"^[-・]\s", stripped):
            blocks.append({"object": "block", "type": "bulleted_list_item",
                            "bulleted_list_item": {"rich_text": parse_inline(stripped[2:])}})
        elif re.match(r"^\d+\.\s", stripped):
            content = re.sub(r"^\d+\.\s", "", stripped)
            blocks.append({"object": "block", "type": "numbered_list_item",
                            "numbered_list_item": {"rich_text": parse_inline(content)}})
        elif stripped.startswith("⚠️"):
            blocks.append({
                "object": "block",
                "type": "callout",
                "callout": {"rich_text": parse_inline(stripped), "icon": {"type": "emoji", "emoji": "⚠️"}},
            })
        else:
            blocks.append({"object": "block", "type": "paragraph",
                            "paragraph": {"rich_text": parse_inline(stripped)}})

    flush_table()
    return blocks
