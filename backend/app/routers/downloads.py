from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from ..schemas import DownloadStartRequest
from ..services.downloads import (
    list_jobs,
    load_download_presets,
    save_download_presets,
    start_download,
)

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.get("")
def get_jobs() -> list[dict]:
    return list_jobs()


@router.post("/start")
def create_download_job(payload: DownloadStartRequest) -> dict:
    try:
        return start_download(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Downloader not found: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/presets")
def get_download_presets() -> dict:
    return load_download_presets()


@router.get("/presets/", include_in_schema=False)
def get_download_presets_slash() -> dict:
    return load_download_presets()


@router.put("/presets")
def put_download_presets(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")
    return save_download_presets(payload)


@router.put("/presets/", include_in_schema=False)
def put_download_presets_slash(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")
    return save_download_presets(payload)
