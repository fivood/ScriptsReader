from __future__ import annotations

from fastapi import APIRouter

from ..schemas import HighlightUpsertRequest, NoteUpsertRequest
from ..services.annotations import get_episode_annotations, upsert_highlight, upsert_note

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.get("/episodes/{episode_id}")
def get_annotations(episode_id: int) -> dict:
    return get_episode_annotations(episode_id)


@router.put("/highlight")
def put_highlight(payload: HighlightUpsertRequest) -> dict:
    return upsert_highlight(payload.episode_id, payload.line_index, payload.color)


@router.put("/note")
def put_note(payload: NoteUpsertRequest) -> dict:
    return upsert_note(payload.episode_id, payload.line_index, payload.content)
