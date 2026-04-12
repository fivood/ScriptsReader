from __future__ import annotations

from ..database import get_connection, init_db


def get_episode_annotations(episode_id: int) -> dict:
    init_db()
    with get_connection() as conn:
        highlights = conn.execute(
            "SELECT line_index, color FROM highlights WHERE episode_id = ?",
            (episode_id,),
        ).fetchall()
        notes = conn.execute(
            "SELECT line_index, content FROM notes WHERE episode_id = ?",
            (episode_id,),
        ).fetchall()

    return {
        "episode_id": episode_id,
        "highlights": {str(int(row["line_index"])): row["color"] for row in highlights},
        "notes": {str(int(row["line_index"])): row["content"] for row in notes},
    }


def upsert_highlight(episode_id: int, line_index: int, color: str | None) -> dict:
    init_db()
    with get_connection() as conn:
        if color is None:
            conn.execute(
                "DELETE FROM highlights WHERE episode_id = ? AND line_index = ?",
                (episode_id, line_index),
            )
        else:
            conn.execute(
                """
                INSERT INTO highlights(episode_id, line_index, color, updated_at)
                VALUES(?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(episode_id, line_index)
                DO UPDATE SET color = excluded.color, updated_at = CURRENT_TIMESTAMP
                """,
                (episode_id, line_index, color),
            )

    return get_episode_annotations(episode_id)


def upsert_note(episode_id: int, line_index: int, content: str | None) -> dict:
    init_db()
    text = (content or "").strip()
    with get_connection() as conn:
        if not text:
            conn.execute(
                "DELETE FROM notes WHERE episode_id = ? AND line_index = ?",
                (episode_id, line_index),
            )
        else:
            conn.execute(
                """
                INSERT INTO notes(episode_id, line_index, content, updated_at)
                VALUES(?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(episode_id, line_index)
                DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
                """,
                (episode_id, line_index, text),
            )

    return get_episode_annotations(episode_id)
