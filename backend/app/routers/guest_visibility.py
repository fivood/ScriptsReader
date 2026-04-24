from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..database import get_connection, init_db

router = APIRouter(prefix="/api/guest-visible-shows", tags=["guest-visibility"])


class GuestVisibleShowsUpdate(BaseModel):
    show_names: list[str]


@router.get("")
def get_guest_visible_shows() -> list[dict]:
    init_db()
    with get_connection() as conn:
        # Get all shows in library
        all_shows = conn.execute(
            "SELECT name FROM shows ORDER BY name COLLATE NOCASE"
        ).fetchall()
        visible_rows = conn.execute(
            "SELECT show_name FROM guest_visible_shows"
        ).fetchall()
        visible_set = {row["show_name"] for row in visible_rows}

    return [
        {"name": row["name"], "visible": row["name"] in visible_set}
        for row in all_shows
    ]


@router.put("")
def update_guest_visible_shows(body: GuestVisibleShowsUpdate) -> dict:
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM guest_visible_shows")
        for name in body.show_names:
            conn.execute(
                "INSERT INTO guest_visible_shows(show_name) VALUES(?)",
                (name,),
            )
    return {"status": "ok", "count": len(body.show_names)}
