from __future__ import annotations

from fastapi import APIRouter

from ..services.catalog import get_catalog_status, refresh_catalog, search_catalog

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.post("/refresh")
def post_refresh() -> dict:
    return refresh_catalog()


@router.get("/status")
def get_status() -> dict:
    return get_catalog_status()


@router.get("/search")
def get_search(q: str = "", limit: int = 80) -> list[dict]:
    return search_catalog(q, limit)
