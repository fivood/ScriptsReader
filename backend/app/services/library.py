from __future__ import annotations

import shutil
from pathlib import Path

from ..config import DEFAULT_LIBRARY_SOURCES, IMPORTS_DIR, LIBRARY_DIR, SUPPORTED_IMPORT_EXTENSIONS
from ..database import get_connection, init_db
from .parser import ParsedEpisode, parse_file


def _clear_library(conn) -> None:
    conn.execute("DELETE FROM dialogue_lines")
    conn.execute("DELETE FROM episodes")
    conn.execute("DELETE FROM seasons")
    conn.execute("DELETE FROM shows")


def _get_or_create_show(conn, name: str, source: str) -> int:
    conn.execute(
        "INSERT OR IGNORE INTO shows(name, source) VALUES(?, ?)",
        (name, source),
    )
    row = conn.execute("SELECT id FROM shows WHERE name = ?", (name,)).fetchone()
    return int(row["id"])


def _get_or_create_season(conn, show_id: int, season_number: int) -> int:
    conn.execute(
        "INSERT OR IGNORE INTO seasons(show_id, season_number) VALUES(?, ?)",
        (show_id, season_number),
    )
    row = conn.execute(
        "SELECT id FROM seasons WHERE show_id = ? AND season_number = ?",
        (show_id, season_number),
    ).fetchone()
    return int(row["id"])


def _store_episode(conn, episode: ParsedEpisode, source: str) -> int:
    show_id = _get_or_create_show(conn, episode.show_name, source)
    season_id = _get_or_create_season(conn, show_id, episode.season_number)
    conn.execute(
        """
        INSERT OR IGNORE INTO episodes(season_id, episode_code, title, source_path, source_url)
        VALUES(?, ?, ?, ?, ?)
        """,
        (season_id, episode.episode_code, episode.title, episode.source_path, episode.source_url),
    )
    row = conn.execute(
        """
        SELECT id FROM episodes
        WHERE season_id = ? AND title = ? AND source_path = ?
        """,
        (season_id, episode.title, episode.source_path),
    ).fetchone()
    episode_id = int(row["id"])

    for line_index, line in enumerate(episode.lines, start=1):
        conn.execute(
            """
            INSERT OR REPLACE INTO dialogue_lines(episode_id, line_index, speaker, text, is_direction)
            VALUES(?, ?, ?, ?, ?)
            """,
            (episode_id, line_index, line.speaker, line.text, int(line.is_direction)),
        )

    return episode_id


def _iter_source_files() -> list[Path]:
    files: list[Path] = []
    for source_dir in DEFAULT_LIBRARY_SOURCES:
        if not source_dir.exists():
            continue
        for path in source_dir.rglob("*"):
            if path.is_file() and path.suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS:
                files.append(path)
    return sorted(files)


def rebuild_library() -> dict[str, int]:
    init_db()
    files = _iter_source_files()
    imported_episodes = 0
    with get_connection() as conn:
        _clear_library(conn)
        for path in files:
            source = "manual_import" if IMPORTS_DIR in path.parents else "local_library"
            for episode in parse_file(path):
                if not episode.lines:
                    continue
                _store_episode(conn, episode, source)
                imported_episodes += 1

    return {"files": len(files), "episodes": imported_episodes}


def import_uploaded_file(source_path: Path) -> int:
    init_db()
    imported_episodes = 0
    with get_connection() as conn:
        source = "manual_import"
        for episode in parse_file(source_path):
            if not episode.lines:
                continue
            _store_episode(conn, episode, source)
            imported_episodes += 1
    return imported_episodes


def save_uploaded_file(filename: str, content: bytes) -> Path:
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename).name
    destination = IMPORTS_DIR / safe_name
    destination.write_bytes(content)
    return destination


def copy_into_library(source_path: Path) -> Path:
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    destination = LIBRARY_DIR / source_path.name
    shutil.copy2(source_path, destination)
    return destination


def fetch_library_tree() -> list[dict]:
    init_db()
    with get_connection() as conn:
        shows = conn.execute(
            "SELECT id, name FROM shows ORDER BY name COLLATE NOCASE"
        ).fetchall()
        payload: list[dict] = []
        for show in shows:
            seasons = conn.execute(
                "SELECT id, season_number FROM seasons WHERE show_id = ? ORDER BY season_number",
                (show["id"],),
            ).fetchall()
            season_items = []
            for season in seasons:
                episodes = conn.execute(
                    """
                    SELECT episodes.id, episodes.episode_code, episodes.title, COUNT(dialogue_lines.id) AS line_count
                    FROM episodes
                    LEFT JOIN dialogue_lines ON dialogue_lines.episode_id = episodes.id
                    WHERE episodes.season_id = ?
                    GROUP BY episodes.id
                    ORDER BY episodes.episode_code IS NULL, episodes.episode_code, episodes.title
                    """,
                    (season["id"],),
                ).fetchall()
                season_items.append(
                    {
                        "id": int(season["id"]),
                        "season_number": int(season["season_number"]),
                        "episodes": [
                            {
                                "id": int(episode["id"]),
                                "episode_code": episode["episode_code"],
                                "title": episode["title"],
                                "line_count": int(episode["line_count"]),
                            }
                            for episode in episodes
                        ],
                    }
                )
            payload.append(
                {
                    "id": int(show["id"]),
                    "name": show["name"],
                    "seasons": season_items,
                }
            )
    return payload


def fetch_episode_content(episode_id: int, speakers: set[str] | None = None) -> dict | None:
    init_db()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT episodes.id, episodes.episode_code, episodes.title, episodes.source_path, episodes.source_url,
                   seasons.season_number, shows.name AS show_name
            FROM episodes
            JOIN seasons ON seasons.id = episodes.season_id
            JOIN shows ON shows.id = seasons.show_id
            WHERE episodes.id = ?
            """,
            (episode_id,),
        ).fetchone()
        if not row:
            return None

        query = """
            SELECT line_index, speaker, text, is_direction
            FROM dialogue_lines
            WHERE episode_id = ?
        """
        params: list = [episode_id]
        if speakers:
            placeholders = ",".join("?" for _ in speakers)
            query += f" AND (speaker IN ({placeholders}) OR is_direction = 1)"
            params.extend(sorted(speakers))
        query += " ORDER BY line_index"

        lines = conn.execute(query, params).fetchall()
        speaker_rows = conn.execute(
            "SELECT DISTINCT speaker FROM dialogue_lines WHERE episode_id = ? AND speaker IS NOT NULL ORDER BY speaker",
            (episode_id,),
        ).fetchall()

    return {
        "id": int(row["id"]),
        "show_name": row["show_name"],
        "season_number": int(row["season_number"]),
        "episode_code": row["episode_code"],
        "title": row["title"],
        "source_path": row["source_path"],
        "source_url": row["source_url"],
        "speakers": [speaker_row["speaker"] for speaker_row in speaker_rows if speaker_row["speaker"]],
        "lines": [
            {
                "line_index": int(line["line_index"]),
                "speaker": line["speaker"],
                "text": line["text"],
                "is_direction": bool(line["is_direction"]),
            }
            for line in lines
        ],
    }
