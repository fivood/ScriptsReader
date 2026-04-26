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
from .routers import ai, annotations, catalog, collections, downloads, guest_visibility, imports, scripts, search, settings, translate
from .services.library import rebuild_library


# ── Token auth middleware ───────────────────────────────────

class TokenAuthMiddleware(BaseHTTPMiddleware):
    """If SR_AUTH_TOKEN is set, require ?token= or Authorization header."""

    OPEN_PATHS = {"/api/health", "/api/version", "/login", "/guest-login", "/browse"}

    async def dispatch(self, request: Request, call_next):
        request.state.is_admin = False
        request.state.is_guest = False

        if not AUTH_TOKEN:
            request.state.is_admin = True
            return await call_next(request)

        path = request.url.path

        # Allow static assets and open endpoints
        if path.startswith("/static/") or path in self.OPEN_PATHS:
            request.state.is_admin = True
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

        # Admin dashboard (/admin) requires valid sr_token only — guests are not allowed
        if path == "/admin":
            if token == AUTH_TOKEN:
                request.state.is_admin = True
                return await call_next(request)
            return RedirectResponse("/login")

        if token == AUTH_TOKEN:
            request.state.is_admin = True
            return await call_next(request)

        # Guest mode: allow read-only API requests
        is_guest = request.cookies.get("sr_guest", "") == "1"
        if is_guest and request.method in ("GET", "HEAD"):
            request.state.is_guest = True
            return await call_next(request)

        # For HTML page request, redirect to login
        if "text/html" in request.headers.get("accept", ""):
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
app.include_router(ai.router)
app.include_router(collections.router)
app.include_router(settings.router)
app.include_router(guest_visibility.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # rebuild_library()  # 开发阶段避免重启清空用户数据；保留手动"重建索引"入口


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
        resp = RedirectResponse("/admin", status_code=303)
        resp.set_cookie("sr_token", token, httponly=False, samesite="lax", max_age=86400 * 30)
        return resp
    return FileResponse(STATIC_DIR / "login.html", media_type="text/html")


@app.get("/guest-login")
def guest_login() -> RedirectResponse:
    """Enter guest mode: allow read-only browsing without a token."""
    resp = RedirectResponse("/browse", status_code=303)
    resp.set_cookie("sr_guest", "1", httponly=False, samesite="lax", max_age=86400 * 30)
    return resp


@app.get("/")
def index(request: Request) -> RedirectResponse:
    token = request.cookies.get("sr_token", "")
    if token == AUTH_TOKEN:
        return RedirectResponse("/admin")
    return RedirectResponse("/login")


@app.get("/admin")
def admin_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/browse")
def browse_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "browse.html", media_type="text/html")
