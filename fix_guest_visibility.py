#!/usr/bin/env python3
"""Sync all existing shows to guest_visible_shows without rebuilding library."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).with_name("data") / "scriptsreader.db"


def main() -> None:
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Ensure table exists
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS guest_visible_shows (show_name TEXT PRIMARY KEY)"
    )

    shows = cursor.execute("SELECT name FROM shows ORDER BY name").fetchall()
    if not shows:
        print("No shows found in database. Run rebuild_library first.")
        conn.close()
        return

    cursor.execute("DELETE FROM guest_visible_shows")
    for row in shows:
        cursor.execute(
            "INSERT OR IGNORE INTO guest_visible_shows(show_name) VALUES(?)",
            (row["name"],),
        )

    conn.commit()
    conn.close()
    print(f"Synced {len(shows)} shows to guest visibility.")


if __name__ == "__main__":
    main()
