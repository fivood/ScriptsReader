from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from collections import deque

from ..config import DOWNLOAD_LOG_DIR, DOWNLOAD_PRESETS_PATH, WORKSPACE_ROOT
from ..schemas import DownloadStartRequest
from .library import rebuild_library


@dataclass
class DownloadJobState:
    job_id: str
    target: str
    status: str
    started_at: str
    finished_at: str | None
    log_path: str
    exit_code: int | None
    indexed: bool = False
    process: subprocess.Popen | None = None


_LOCK = Lock()
_JOBS: dict[str, DownloadJobState] = {}
_SCRIPT_MAP = {
    "poi": WORKSPACE_ROOT / "download_poi_scripts.py",
    "all": WORKSPACE_ROOT / "download_all_scripts.py",
    "springfield": WORKSPACE_ROOT / "download_springfield_scripts.py",
    "foreverdreaming": WORKSPACE_ROOT / "download_foreverdreaming_scripts.py",
    "imsdb": WORKSPACE_ROOT / "download_imsdb_movie_scripts.py",
}


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _build_command(payload: DownloadStartRequest, script_path: Path) -> list[str]:
    # Use unbuffered mode so progress logs are visible to the UI in near real-time.
    cmd = [sys.executable, "-u", str(script_path)]

    if payload.target == "springfield":
        show_slug = (payload.show_slug or "").strip()
        if not show_slug:
            raise ValueError("springfield target requires show_slug")
        cmd.extend(["--show", show_slug])
        if payload.show_name:
            cmd.extend(["--show-name", payload.show_name.strip()])
        if payload.all_seasons or not payload.seasons:
            cmd.append("--all-seasons")
        else:
            cmd.append("--seasons")
            cmd.extend([str(item) for item in payload.seasons])

    elif payload.target == "foreverdreaming":
        index_url = (payload.index_url or "").strip()
        show_name = (payload.show_name or "").strip()
        if not index_url or not show_name:
            raise ValueError("foreverdreaming target requires index_url and show_name")
        cmd.extend(["--index-url", index_url, "--show-name", show_name])
        if payload.limit and payload.limit > 0:
            cmd.extend(["--limit", str(payload.limit)])

    elif payload.target == "imsdb":
        titles = [item.strip() for item in (payload.titles or []) if item.strip()]
        if payload.download_all:
            cmd.append("--all")
        elif titles:
            cmd.append("--titles")
            cmd.extend(titles)
        else:
            raise ValueError("imsdb target requires download_all=true or non-empty titles")
        if payload.limit and payload.limit > 0:
            cmd.extend(["--limit", str(payload.limit)])

    return cmd


def start_download(payload: DownloadStartRequest) -> dict:
    target = payload.target
    script_path = _SCRIPT_MAP[target]
    if not script_path.exists():
        raise FileNotFoundError(script_path)

    command = _build_command(payload, script_path)

    DOWNLOAD_LOG_DIR.mkdir(parents=True, exist_ok=True)
    job_id = f"{target}-{_timestamp()}"
    log_path = DOWNLOAD_LOG_DIR / f"{job_id}.log"
    log_file = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=str(WORKSPACE_ROOT),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )

    state = DownloadJobState(
        job_id=job_id,
        target=target,
        status="running",
        started_at=datetime.now().isoformat(timespec="seconds"),
        finished_at=None,
        log_path=str(log_path),
        exit_code=None,
        process=process,
    )
    with _LOCK:
        _JOBS[job_id] = state
    return serialize_job(state)


def _refresh_job(state: DownloadJobState) -> None:
    if state.process is None or state.status != "running":
        return
    exit_code = state.process.poll()
    if exit_code is None:
        return
    state.exit_code = exit_code
    state.status = "finished" if exit_code == 0 else "failed"
    state.finished_at = datetime.now().isoformat(timespec="seconds")
    state.process = None
    if state.status == "finished" and not state.indexed:
        # Keep reader library in sync after background downloads complete.
        rebuild_library()
        state.indexed = True


def _tail_log_lines(log_path: str, max_lines: int = 120) -> list[str]:
    path = Path(log_path)
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            lines = deque(fh, maxlen=max_lines)
        return [line.strip() for line in lines if line.strip()]
    except Exception:
        return []


def _summarize_log(state: DownloadJobState) -> dict:
    lines = _tail_log_lines(state.log_path)
    if not lines:
        return {
            "progress_text": None,
            "current_item": None,
            "last_log_line": None,
            "error_line": None,
        }

    current_item = None
    progress_text = None
    error_line = None

    for line in lines:
        lower = line.lower()

        # Examples: "[12/90] Episode Title", "[3/120] 处理剧集：..."
        if re.search(r"\[\d+/\d+\]", line) and "进度" not in line:
            current_item = line

        # Explicit progress lines emitted by batch downloader.
        if "进度：" in line:
            progress_text = line

        if (
            "traceback" in lower
            or "error" in lower
            or "failed" in lower
            or "fetch fail" in lower
            or "失败" in line
            or "[!]" in line
        ):
            error_line = line

    if not progress_text:
        progress_text = current_item

    def _clip(text: str | None, limit: int = 220) -> str | None:
        if not text:
            return None
        return text if len(text) <= limit else f"{text[:limit - 1]}..."

    return {
        "progress_text": _clip(progress_text),
        "current_item": _clip(current_item),
        "last_log_line": _clip(lines[-1]),
        "error_line": _clip(error_line),
    }


def serialize_job(state: DownloadJobState) -> dict:
    _refresh_job(state)
    summary = _summarize_log(state)
    return {
        "job_id": state.job_id,
        "target": state.target,
        "status": state.status,
        "started_at": state.started_at,
        "finished_at": state.finished_at,
        "log_path": state.log_path,
        "exit_code": state.exit_code,
        "progress_text": summary["progress_text"],
        "current_item": summary["current_item"],
        "last_log_line": summary["last_log_line"],
        "error_line": summary["error_line"],
    }


def list_jobs() -> list[dict]:
    with _LOCK:
        jobs = [serialize_job(job) for job in _JOBS.values()]
    return sorted(jobs, key=lambda item: item["started_at"], reverse=True)


def cancel_download(job_id: str) -> dict:
    with _LOCK:
        state = _JOBS.get(job_id)
        if not state:
            raise KeyError(job_id)

    _refresh_job(state)
    if state.status != "running" or state.process is None:
        return serialize_job(state)

    proc = state.process
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
            proc.wait(timeout=5)
        except Exception:
            pass

    state.exit_code = state.exit_code if state.exit_code is not None else -15
    state.status = "canceled"
    state.finished_at = datetime.now().isoformat(timespec="seconds")
    state.process = None
    return serialize_job(state)


def load_download_presets() -> dict:
    if not DOWNLOAD_PRESETS_PATH.exists():
        return {}
    try:
        payload = json.loads(DOWNLOAD_PRESETS_PATH.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload
    except Exception:
        return {}
    return {}


def save_download_presets(payload: dict) -> dict:
    DOWNLOAD_PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_PRESETS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload
