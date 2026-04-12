from __future__ import annotations

from fastapi import APIRouter, Query

from ..services.search import search_lines, search_speaker_timeline

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/lines")
def search_dialogue_lines(
    q: str = Query(min_length=1, description="Keyword to search in dialogue text and speaker"),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    items = search_lines(q, limit)
    return {"query": q, "count": len(items), "items": items}


@router.get("/speaker/{speaker}")
def search_speaker(
    speaker: str,
    limit: int = Query(default=300, ge=1, le=1000),
) -> dict:
    items = search_speaker_timeline(speaker, limit)
    return {"speaker": speaker, "count": len(items), "items": items}
