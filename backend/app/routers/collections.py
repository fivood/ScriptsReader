from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response

from ..schemas import CollectionCreateRequest, CollectionItemCreateRequest
from ..services.collections import (
    add_collection_item,
    create_collection,
    delete_collection,
    export_collection_json_payload,
    export_collection_markdown,
    list_collections,
    remove_collection_item,
)

router = APIRouter(prefix="/api/collections", tags=["collections"])


def _require_admin(request: Request) -> None:
    if getattr(request.state, "is_guest", False):
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("")
def get_collections(request: Request) -> list[dict]:
    _require_admin(request)
    return list_collections()


@router.post("")
def post_collection(payload: CollectionCreateRequest) -> dict:
    try:
        return create_collection(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{collection_id}")
def delete_collection_api(collection_id: int) -> dict:
    delete_collection(collection_id)
    return {"ok": True}


@router.post("/items")
def post_collection_item(payload: CollectionItemCreateRequest) -> dict:
    try:
        add_collection_item(
            collection_id=payload.collection_id,
            episode_id=payload.episode_id,
            line_index=payload.line_index,
            text=payload.text,
            speaker=payload.speaker,
            tags=payload.tags,
            note=payload.note,
        )
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/items/{item_id}")
def delete_collection_item_api(item_id: int) -> dict:
    remove_collection_item(item_id)
    return {"ok": True}


@router.get("/{collection_id}/export.md", response_class=PlainTextResponse)
def export_collection_md(collection_id: int, request: Request) -> Response:
    _require_admin(request)
    try:
        content = export_collection_markdown(collection_id)
        return Response(
            content=content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="collection-{collection_id}.md"'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{collection_id}/export.json")
def export_collection_json(collection_id: int, request: Request) -> Response:
    _require_admin(request)
    try:
        payload = export_collection_json_payload(collection_id)
        return Response(
            content=json.dumps(payload, ensure_ascii=False, indent=2),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="collection-{collection_id}.json"'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
