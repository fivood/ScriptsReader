from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import STATIC_DIR
from .database import init_db
from .routers import annotations, catalog, downloads, imports, ollama, scripts, search, translate
from .services.library import rebuild_library

app = FastAPI(title="ScriptsReader", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scripts.router)
app.include_router(imports.router)
app.include_router(downloads.router)
app.include_router(search.router)
app.include_router(translate.router)
app.include_router(annotations.router)
app.include_router(catalog.router)
app.include_router(ollama.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    rebuild_library()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
