from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from .config import AUTH_TOKEN, STATIC_DIR, get_version
from .database import init_db
from .routers import annotations, catalog, collections, downloads, imports, ollama, scripts, search, settings, translate
from .services.library import rebuild_library


# ── Token auth middleware ───────────────────────────────────

class TokenAuthMiddleware(BaseHTTPMiddleware):
    """If SR_AUTH_TOKEN is set, require ?token= or Authorization header."""

    OPEN_PATHS = {"/api/health", "/api/version", "/login"}

    async def dispatch(self, request: Request, call_next):
        if not AUTH_TOKEN:
            return await call_next(request)

        path = request.url.path

        # Allow static assets and open endpoints
        if path.startswith("/static/") or path in self.OPEN_PATHS:
            return await call_next(request)

        # Check query param first, then Authorization header
        token = request.query_params.get("token", "")
        if not token:
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:]

        # Check cookie
        if not token:
            token = request.cookies.get("sr_token", "")

        if token == AUTH_TOKEN:
            return await call_next(request)

        # For HTML page request, redirect to login
        if path == "/" or "text/html" in request.headers.get("accept", ""):
            return RedirectResponse("/login")

        return JSONResponse({"detail": "Unauthorized"}, status_code=401)


app = FastAPI(title="ScriptsReader", version="0.1.0")
app.add_middleware(TokenAuthMiddleware)
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
app.include_router(collections.router)
app.include_router(settings.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    rebuild_library()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/version")
def get_app_version() -> dict:
    """Return application version info."""
    return {"version": get_version()}


@app.get("/login")
def login_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "login.html", media_type="text/html")


@app.post("/login")
async def login_verify(request: Request):
    form = await request.form()
    token = str(form.get("token", "")).strip()
    if token == AUTH_TOKEN:
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie("sr_token", token, httponly=True, samesite="lax", max_age=86400 * 30)
        return resp
    return FileResponse(STATIC_DIR / "login.html", media_type="text/html")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
