from __future__ import annotations

from ..database import get_connection, init_db


def _normalize_tags(tags: list[str] | None) -> str:
    if not tags:
        return ""
    cleaned = [item.strip() for item in tags if item and item.strip()]
    deduped = []
    seen = set()
    for item in cleaned:
        low = item.lower()
        if low not in seen:
            seen.add(low)
            deduped.append(item)
    return ",".join(deduped)


def list_collections() -> list[dict]:
    init_db()
    with get_connection() as conn:
        collections = conn.execute(
            """
            SELECT c.id, c.name, c.created_at, c.updated_at,
                   COUNT(ci.id) AS item_count
            FROM collections c
            LEFT JOIN collection_items ci ON ci.collection_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC, c.id DESC
            """
        ).fetchall()

        payload: list[dict] = []
        for row in collections:
            items = conn.execute(
                """
                SELECT ci.id, ci.episode_id, ci.line_index, ci.speaker, ci.text, ci.tags, ci.note, ci.created_at,
                      e.episode_code, e.title,
                      s.season_number,
                      sh.name AS show_name
                FROM collection_items ci
                  LEFT JOIN episodes e ON e.id = ci.episode_id
                  LEFT JOIN seasons s ON s.id = e.season_id
                  LEFT JOIN shows sh ON sh.id = s.show_id
                WHERE ci.collection_id = ?
                ORDER BY ci.created_at DESC, ci.id DESC
                """,
                (row["id"],),
            ).fetchall()
            payload.append(
                {
                    "id": int(row["id"]),
                    "name": row["name"],
                    "item_count": int(row["item_count"] or 0),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "items": [
                        {
                            "id": int(item["id"]),
                            "episode_id": int(item["episode_id"]),
                            "line_index": int(item["line_index"]),
                            "speaker": item["speaker"],
                            "text": item["text"],
                            "tags": [tag for tag in (item["tags"] or "").split(",") if tag],
                            "note": item["note"] or "",
                            "created_at": item["created_at"],
                            "show_name": item["show_name"] or "Unknown Show",
                            "season_number": int(item["season_number"] or 0),
                            "episode_code": item["episode_code"],
                            "episode_title": item["title"] or "Unknown Episode",
                        }
                        for item in items
                    ],
                }
            )
    return payload


def create_collection(name: str) -> dict:
    init_db()
    value = (name or "").strip()
    if not value:
        raise ValueError("name is required")
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO collections(name, updated_at) VALUES(?, CURRENT_TIMESTAMP)",
            (value,),
        )
        row = conn.execute("SELECT id, name, created_at, updated_at FROM collections WHERE name = ?", (value,)).fetchone()
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "item_count": 0,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "items": [],
    }


def delete_collection(collection_id: int) -> None:
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM collections WHERE id = ?", (collection_id,))


def add_collection_item(
    collection_id: int,
    episode_id: int,
    line_index: int,
    text: str,
    speaker: str | None = None,
    tags: list[str] | None = None,
    note: str = "",
) -> None:
    init_db()
    body = (text or "").strip()
    if not body:
        raise ValueError("text is required")
    with get_connection() as conn:
        exists = conn.execute("SELECT id FROM collections WHERE id = ?", (collection_id,)).fetchone()
        if not exists:
            raise ValueError("collection not found")
        ep_exists = conn.execute("SELECT id FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not ep_exists:
            raise ValueError("episode not found")

        conn.execute(
            """
            INSERT INTO collection_items(collection_id, episode_id, line_index, speaker, text, tags, note, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(collection_id, episode_id, line_index)
            DO UPDATE SET
                speaker = excluded.speaker,
                text = excluded.text,
                tags = excluded.tags,
                note = excluded.note,
                created_at = CURRENT_TIMESTAMP
            """,
            (
                collection_id,
                episode_id,
                line_index,
                (speaker or "").strip() or None,
                body,
                _normalize_tags(tags),
                (note or "").strip(),
            ),
        )
        conn.execute(
            "UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (collection_id,),
        )


def remove_collection_item(item_id: int) -> None:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT collection_id FROM collection_items WHERE id = ?", (item_id,)).fetchone()
        conn.execute("DELETE FROM collection_items WHERE id = ?", (item_id,))
        if row:
            conn.execute(
                "UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (int(row["collection_id"]),),
            )


def export_collection_markdown(collection_id: int) -> str:
    collections = list_collections()
    collection = next((item for item in collections if item["id"] == collection_id), None)
    if not collection:
        raise ValueError("collection not found")

    lines = [f"# 收藏库 - {collection['name']}", ""]
    for item in collection["items"]:
        loc = f"{item['show_name']} / Season {item['season_number']:02d} / {item['episode_code'] or 'EP'} {item['episode_title']} / Line {item['line_index']}"
        lines.append(f"## {loc}")
        if item["speaker"]:
            lines.append(f"- Speaker: {item['speaker']}")
        if item["tags"]:
            lines.append(f"- Tags: {', '.join(item['tags'])}")
        if item["note"]:
            lines.append(f"- Note: {item['note']}")
        lines.append("")
        lines.append(f"> {item['text']}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"
