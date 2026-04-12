from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services.library import fetch_episode_content, fetch_library_tree, rebuild_library

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("/shows")
def get_shows() -> list[dict]:
    return fetch_library_tree()


@router.post("/rebuild")
def rebuild() -> dict:
    result = rebuild_library()
    return {"status": "ok", **result}


@router.get("/episodes/{episode_id}")
def get_episode(episode_id: int, speakers: str | None = Query(default=None)) -> dict:
    selected = {item.strip() for item in speakers.split(",") if item.strip()} if speakers else None
    payload = fetch_episode_content(episode_id, selected)
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload
