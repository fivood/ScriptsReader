from __future__ import annotations

from ..database import get_connection, init_db


def search_lines(keyword: str, limit: int = 50) -> list[dict]:
    init_db()
    query = keyword.strip()
    if not query:
        return []

    like = f"%{query}%"
    safe_limit = max(1, min(limit, 200))

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                dialogue_lines.episode_id,
                dialogue_lines.line_index,
                dialogue_lines.speaker,
                dialogue_lines.text,
                dialogue_lines.is_direction,
                episodes.episode_code,
                episodes.title AS episode_title,
                seasons.season_number,
                shows.name AS show_name
            FROM dialogue_lines
            JOIN episodes ON episodes.id = dialogue_lines.episode_id
            JOIN seasons ON seasons.id = episodes.season_id
            JOIN shows ON shows.id = seasons.show_id
            WHERE dialogue_lines.text LIKE ? OR dialogue_lines.speaker LIKE ?
            ORDER BY shows.name COLLATE NOCASE, seasons.season_number, episodes.episode_code, dialogue_lines.line_index
            LIMIT ?
            """,
            (like, like, safe_limit),
        ).fetchall()

    return [
        {
            "episode_id": int(row["episode_id"]),
            "line_index": int(row["line_index"]),
            "speaker": row["speaker"],
            "text": row["text"],
            "is_direction": bool(row["is_direction"]),
            "episode_code": row["episode_code"],
            "episode_title": row["episode_title"],
            "season_number": int(row["season_number"]),
            "show_name": row["show_name"],
        }
        for row in rows
    ]


def search_speaker_timeline(speaker: str, limit: int = 300) -> list[dict]:
    init_db()
    name = (speaker or "").strip()
    if not name:
        return []

    safe_limit = max(1, min(limit, 1000))
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                dialogue_lines.episode_id,
                dialogue_lines.line_index,
                dialogue_lines.speaker,
                dialogue_lines.text,
                episodes.episode_code,
                episodes.title AS episode_title,
                seasons.season_number,
                shows.name AS show_name
            FROM dialogue_lines
            JOIN episodes ON episodes.id = dialogue_lines.episode_id
            JOIN seasons ON seasons.id = episodes.season_id
            JOIN shows ON shows.id = seasons.show_id
            WHERE dialogue_lines.speaker = ?
            ORDER BY shows.name COLLATE NOCASE, seasons.season_number, episodes.episode_code, dialogue_lines.line_index
            LIMIT ?
            """,
            (name, safe_limit),
        ).fetchall()

    return [
        {
            "episode_id": int(row["episode_id"]),
            "line_index": int(row["line_index"]),
            "speaker": row["speaker"],
            "text": row["text"],
            "episode_code": row["episode_code"],
            "episode_title": row["episode_title"],
            "season_number": int(row["season_number"]),
            "show_name": row["show_name"],
        }
        for row in rows
    ]
