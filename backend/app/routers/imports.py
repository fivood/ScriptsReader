from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import IMPORTS_DIR, SUPPORTED_IMPORT_EXTENSIONS
from ..services.library import delete_imported_file, import_uploaded_file, save_uploaded_file

router = APIRouter(prefix="/api/imports", tags=["imports"])


@router.get("/files")
def list_imported_files() -> list[dict]:
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(IMPORTS_DIR.iterdir()):
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMPORT_EXTENSIONS:
            stat = path.stat()
            files.append({
                "name": path.name,
                "size": stat.st_size,
                "modified_at": stat.st_mtime,
            })
    return files


@router.post("/files")
async def import_files(files: list[UploadFile] = File(...)) -> dict:
    imported_files = 0
    imported_episodes = 0
    skipped_files: list[str] = []

    for upload in files:
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in SUPPORTED_IMPORT_EXTENSIONS:
            skipped_files.append(upload.filename or "<unknown>")
            continue

        data = await upload.read()
        destination = save_uploaded_file(upload.filename or "imported-file", data)
        try:
            imported_episodes += import_uploaded_file(destination)
            imported_files += 1
        except Exception as exc:
            skipped_files.append(f"{upload.filename}: {exc}")

    if imported_files == 0 and skipped_files:
        raise HTTPException(status_code=400, detail={"skipped_files": skipped_files})

    return {
        "imported_files": imported_files,
        "imported_episodes": imported_episodes,
        "skipped_files": skipped_files,
    }


@router.delete("/files/{filename}")
def delete_import_file(filename: str) -> dict:
    try:
        deleted_episodes = delete_imported_file(filename)
        return {"deleted": True, "deleted_episodes": deleted_episodes}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
