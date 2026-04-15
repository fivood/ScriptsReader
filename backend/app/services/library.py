from __future__ import annotations

import os
import shutil
from pathlib import Path

from ..config import DEFAULT_LIBRARY_SOURCES, IMPORTS_DIR, LIBRARY_DIR, SUPPORTED_IMPORT_EXTENSIONS, WORKSPACE_ROOT
from ..database import get_connection, init_db
from .parser import ParsedEpisode, parse_file


_SCAN_EXCLUDE_DIRS = {
    "__pycache__",
    ".git",
    ".venv",
    "venv",
    "node_modules",
    ".mypy_cache",
    ".pytest_cache",
}


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
            INSERT OR REPLACE INTO dialogue_lines(episode_id, line_index, speaker, text, translation, is_direction)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (episode_id, line_index, line.speaker, line.text, line.translation, int(line.is_direction)),
        )

    return episode_id


def _iter_source_files() -> list[Path]:
    # Auto-discover top-level script output folders so new download targets
    # appear in library rebuilds without changing config.
    discovered_dirs: list[Path] = []
    try:
        for child in WORKSPACE_ROOT.iterdir():
            if not child.is_dir():
                continue
            name = child.name.lower()
            if name.endswith("_scripts_md") or name.endswith("_movies_md"):
                discovered_dirs.append(child)
            # 扫描统一剧本库子目录（scripts_library 或同类命名的父目录）
            if name in ("scripts_library",):
                for sub in child.iterdir():
                    if sub.is_dir():
                        discovered_dirs.append(sub)
    except FileNotFoundError:
        pass

    source_dirs: list[Path] = []
    seen: set[Path] = set()
    for src in [*DEFAULT_LIBRARY_SOURCES, *discovered_dirs]:
        resolved = src.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        source_dirs.append(src)

    files: list[Path] = []
    # Also pick up loose files placed directly in the workspace root
    if WORKSPACE_ROOT.exists():
        for child in WORKSPACE_ROOT.iterdir():
            if child.is_file() and child.suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS:
                files.append(child)

    for source_dir in source_dirs:
        if not source_dir.exists():
            continue
        for root, dir_names, file_names in os.walk(source_dir):
            dir_names[:] = [
                name
                for name in dir_names
                if name not in _SCAN_EXCLUDE_DIRS and not name.startswith(".")
            ]
            root_path = Path(root)
            for file_name in file_names:
                path = root_path / file_name
                if path.suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS:
                    files.append(path)
    return sorted(set(files))


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


def delete_imported_file(filename: str) -> int:
    init_db()
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename:
        raise ValueError("Invalid filename")

    file_path = (IMPORTS_DIR / safe_name).resolve()
    if not file_path.exists():
        raise FileNotFoundError()

    with get_connection() as conn:
        # Find episodes associated with this file
        rows = conn.execute(
            "SELECT id FROM episodes WHERE source_path = ?",
            (str(file_path),),
        ).fetchall()
        episode_ids = [r["id"] for r in rows]

        for eid in episode_ids:
            conn.execute("DELETE FROM collection_items WHERE episode_id = ?", (eid,))
            conn.execute("DELETE FROM reading_progress WHERE episode_id = ?", (eid,))
            conn.execute("DELETE FROM highlights WHERE episode_id = ?", (eid,))
            conn.execute("DELETE FROM notes WHERE episode_id = ?", (eid,))
            conn.execute("DELETE FROM dialogue_lines WHERE episode_id = ?", (eid,))

        if episode_ids:
            placeholders = ",".join("?" for _ in episode_ids)
            conn.execute(f"DELETE FROM episodes WHERE id IN ({placeholders})", tuple(episode_ids))

    file_path.unlink()
    return len(episode_ids)


def delete_episode(episode_id: int) -> dict | None:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None

        conn.execute("DELETE FROM collection_items WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM reading_progress WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM highlights WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM notes WHERE episode_id = ?", (episode_id,))
        conn.execute("DELETE FROM dialogue_lines WHERE episode_id = ?", (episode_id,))

        # Get season/show info before deleting episode
        season_row = conn.execute(
            "SELECT season_id FROM episodes WHERE id = ?", (episode_id,)
        ).fetchone()
        season_id = season_row["season_id"] if season_row else None

        conn.execute("DELETE FROM episodes WHERE id = ?", (episode_id,))

        show_id = None
        if season_id is not None:
            remaining_eps = conn.execute(
                "SELECT COUNT(1) AS c FROM episodes WHERE season_id = ?", (season_id,)
            ).fetchone()
            if remaining_eps and int(remaining_eps["c"]) == 0:
                show_row = conn.execute(
                    "SELECT show_id FROM seasons WHERE id = ?", (season_id,)
                ).fetchone()
                show_id = show_row["show_id"] if show_row else None
                conn.execute("DELETE FROM seasons WHERE id = ?", (season_id,))

        if show_id is not None:
            remaining_seasons = conn.execute(
                "SELECT COUNT(1) AS c FROM seasons WHERE show_id = ?", (show_id,)
            ).fetchone()
            if remaining_seasons and int(remaining_seasons["c"]) == 0:
                conn.execute("DELETE FROM shows WHERE id = ?", (show_id,))

    return {"deleted": True}


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
                    SELECT episodes.id, episodes.episode_code, episodes.title,
                           COUNT(dialogue_lines.id) AS line_count,
                           COALESCE(reading_progress.last_line, 0) AS last_line
                    FROM episodes
                    LEFT JOIN dialogue_lines ON dialogue_lines.episode_id = episodes.id
                    LEFT JOIN reading_progress ON reading_progress.episode_id = episodes.id
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
                                "reading_status": (
                                    "finished"
                                    if int(episode["line_count"]) > 0 and int(episode["last_line"] or 0) >= int(episode["line_count"])
                                    else "in_progress"
                                    if int(episode["last_line"] or 0) > 0
                                    else "unread"
                                ),
                                "last_line": int(episode["last_line"] or 0),
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
            SELECT line_index, speaker, text, translation, is_direction
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
                "translation": line["translation"],
                "is_direction": bool(line["is_direction"]),
            }
            for line in lines
        ],
    }


def upsert_reading_progress(episode_id: int, last_line: int) -> dict | None:
    init_db()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(1) AS c FROM episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not row or int(row["c"]) == 0:
            return None

        conn.execute(
            """
            INSERT INTO reading_progress(episode_id, last_line, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(episode_id) DO UPDATE SET
                last_line = excluded.last_line,
                updated_at = CURRENT_TIMESTAMP
            """,
            (episode_id, max(0, int(last_line))),
        )

        payload = conn.execute(
            "SELECT episode_id, last_line, updated_at FROM reading_progress WHERE episode_id = ?",
            (episode_id,),
        ).fetchone()
        line_count_row = conn.execute(
            "SELECT COUNT(1) AS c FROM dialogue_lines WHERE episode_id = ?",
            (episode_id,),
        ).fetchone()

    line_count = int(line_count_row["c"] or 0)
    saved_line = int(payload["last_line"])
    status = "finished" if line_count > 0 and saved_line >= line_count else "in_progress" if saved_line > 0 else "unread"
    return {
        "episode_id": int(payload["episode_id"]),
        "last_line": saved_line,
        "updated_at": payload["updated_at"],
        "status": status,
    }


def update_episode_meta(episode_id: int, show_name: str | None, season_number: int | None, episode_code: str | None, title: str | None) -> dict | None:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None

        # Update episode fields
        if episode_code is not None or title is not None:
            conn.execute(
                """
                UPDATE episodes
                SET episode_code = COALESCE(?, episode_code),
                    title = COALESCE(?, title)
                WHERE id = ?
                """,
                (episode_code, title, episode_id),
            )

        if show_name is not None or season_number is not None:
            current = conn.execute(
                """
                SELECT seasons.id AS season_id, seasons.show_id, seasons.season_number
                FROM episodes
                JOIN seasons ON seasons.id = episodes.season_id
                WHERE episodes.id = ?
                """,
                (episode_id,),
            ).fetchone()
            if not current:
                return None

            target_show_name = show_name if show_name is not None else conn.execute(
                "SELECT name FROM shows WHERE id = ?", (current["show_id"],)
            ).fetchone()["name"]
            target_season_number = season_number if season_number is not None else current["season_number"]

            show_id = _get_or_create_show(conn, target_show_name, "manual_import")
            season_id = _get_or_create_season(conn, show_id, target_season_number)

            conn.execute(
                "UPDATE episodes SET season_id = ? WHERE id = ?",
                (season_id, episode_id),
            )

        updated = conn.execute(
            """
            SELECT episodes.id, episodes.episode_code, episodes.title,
                   seasons.season_number, shows.name AS show_name
            FROM episodes
            JOIN seasons ON seasons.id = episodes.season_id
            JOIN shows ON shows.id = seasons.show_id
            WHERE episodes.id = ?
            """,
            (episode_id,),
        ).fetchone()

    return {
        "id": int(updated["id"]),
        "show_name": updated["show_name"],
        "season_number": int(updated["season_number"]),
        "episode_code": updated["episode_code"],
        "title": updated["title"],
    }


def bulk_update_lines(episode_id: int, updates: list[dict]) -> dict | None:
    init_db()
    with get_connection() as conn:
        exists = conn.execute("SELECT COUNT(1) AS c FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not exists or int(exists["c"]) == 0:
            return None
        for item in updates:
            line_index = item.get("line_index")
            if line_index is None:
                continue
            speaker = item.get("speaker")
            text = item.get("text")
            translation = item.get("translation")
            conn.execute(
                """
                UPDATE dialogue_lines
                SET speaker = COALESCE(?, speaker),
                    text = COALESCE(?, text),
                    translation = COALESCE(?, translation)
                WHERE episode_id = ? AND line_index = ?
                """,
                (speaker, text, translation, episode_id, line_index),
            )
    return {"updated": len(updates)}


def fetch_reading_progress(episode_id: int) -> dict | None:
    init_db()
    with get_connection() as conn:
        exists = conn.execute(
            "SELECT COUNT(1) AS c FROM episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not exists or int(exists["c"]) == 0:
            return None

        row = conn.execute(
            "SELECT episode_id, last_line, updated_at FROM reading_progress WHERE episode_id = ?",
            (episode_id,),
        ).fetchone()
        line_count_row = conn.execute(
            "SELECT COUNT(1) AS c FROM dialogue_lines WHERE episode_id = ?",
            (episode_id,),
        ).fetchone()

    line_count = int(line_count_row["c"] or 0)
    last_line = int(row["last_line"]) if row else 0
    status = "finished" if line_count > 0 and last_line >= line_count else "in_progress" if last_line > 0 else "unread"
    return {
        "episode_id": int(episode_id),
        "last_line": last_line,
        "updated_at": row["updated_at"] if row else "",
        "status": status,
    }
