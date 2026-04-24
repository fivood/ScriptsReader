from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..schemas import ReadingProgressUpsertRequest
from ..services.library import (
    bulk_update_lines,
    delete_episode,
    fetch_episode_content,
    fetch_guest_library_tree,
    fetch_library_tree,
    fetch_reading_progress,
    rebuild_library,
    update_episode_meta,
    upsert_reading_progress,
)


class EpisodeMetaPatch(BaseModel):
    show_name: str | None = None
    season_number: int | None = None
    episode_code: str | None = None
    title: str | None = None


class LineBulkUpdateItem(BaseModel):
    line_index: int
    speaker: str | None = None
    text: str | None = None
    translation: str | None = None


class LinesBulkPatch(BaseModel):
    updates: list[LineBulkUpdateItem]

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("/shows")
def get_shows() -> list[dict]:
    return fetch_library_tree()


@router.get("/guest-shows")
def get_guest_shows() -> list[dict]:
    return fetch_guest_library_tree()


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


@router.get("/progress/{episode_id}")
def get_progress(episode_id: int) -> dict:
    payload = fetch_reading_progress(episode_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload


@router.put("/progress")
def put_progress(body: ReadingProgressUpsertRequest) -> dict:
    payload = upsert_reading_progress(body.episode_id, body.last_line)
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload


@router.patch("/episodes/{episode_id}")
def patch_episode(episode_id: int, body: EpisodeMetaPatch) -> dict:
    payload = update_episode_meta(
        episode_id,
        show_name=body.show_name,
        season_number=body.season_number,
        episode_code=body.episode_code,
        title=body.title,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload


@router.patch("/episodes/{episode_id}/lines/bulk")
def patch_lines_bulk(episode_id: int, body: LinesBulkPatch) -> dict:
    payload = bulk_update_lines(episode_id, [item.model_dump() for item in body.updates])
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload


@router.delete("/episodes/{episode_id}")
def remove_episode(episode_id: int) -> dict:
    payload = delete_episode(episode_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Episode not found")
    return payload
