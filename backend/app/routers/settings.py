from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])

_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

# Keys that are stored in .env and exposed (masked) via GET
_KEY_FIELDS = [
    "OLLAMA_BASE_URL",
    "OLLAMA_TIMEOUT_SECONDS",
    "TRANSLATION_PROVIDER",
    "BAIDU_TRANSLATE_APP_ID",
    "BAIDU_TRANSLATE_SECRET_KEY",
    "YOUDAO_APP_KEY",
    "YOUDAO_SECRET_KEY",
    "DEEPL_API_KEY",
    "AI_PROVIDER",
    "AI_BASE_URL",
    "AI_API_KEY",
    "AI_MODEL",
]
# Which fields contain secrets (mask the value in GET)
_SECRET_FIELDS = {
    "BAIDU_TRANSLATE_SECRET_KEY",
    "YOUDAO_SECRET_KEY",
    "DEEPL_API_KEY",
    "AI_API_KEY",
}


def _mask(key: str, value: str) -> str:
    if key not in _SECRET_FIELDS or not value:
        return value
    if len(value) <= 6:
        return "****"
    return value[:3] + "****" + value[-3:]


def _read_env() -> dict[str, str]:
    result: dict[str, str] = {}
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                result[k.strip()] = v.strip()
    return result


def _write_env(data: dict[str, str]) -> None:
    """Rewrite .env preserving comments and unknown lines, updating known keys."""
    lines: list[str] = []
    written: set[str] = set()

    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                k, _, _ = stripped.partition("=")
                k = k.strip()
                if k in data:
                    lines.append(f"{k}={data[k]}")
                    written.add(k)
                    continue
            lines.append(line)

    # Append any new keys not yet in file
    for k, v in data.items():
        if k not in written:
            lines.append(f"{k}={v}")

    _ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


class SettingsPatch(BaseModel):
    ollama_base_url: str | None = None
    ollama_timeout_seconds: str | None = None
    translation_provider: str | None = None
    baidu_app_id: str | None = None
    baidu_secret_key: str | None = None
    youdao_app_key: str | None = None
    youdao_secret_key: str | None = None
    deepl_api_key: str | None = None
    ai_provider: str | None = None
    ai_base_url: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None


@router.get("")
def get_settings() -> dict:
    current = _read_env()
    # Merge with live os.environ for keys not in file
    for k in _KEY_FIELDS:
        if k not in current:
            current[k] = os.environ.get(k, "")

    return {
        "ollama_base_url": current.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        "ollama_timeout_seconds": current.get("OLLAMA_TIMEOUT_SECONDS", "120"),
        "translation_provider": current.get("TRANSLATION_PROVIDER", "auto"),
        "baidu_app_id": current.get("BAIDU_TRANSLATE_APP_ID", ""),
        "baidu_secret_key_masked": _mask("BAIDU_TRANSLATE_SECRET_KEY", current.get("BAIDU_TRANSLATE_SECRET_KEY", "")),
        "baidu_configured": bool(current.get("BAIDU_TRANSLATE_APP_ID") and current.get("BAIDU_TRANSLATE_SECRET_KEY")),
        "youdao_app_key": current.get("YOUDAO_APP_KEY", ""),
        "youdao_secret_key_masked": _mask("YOUDAO_SECRET_KEY", current.get("YOUDAO_SECRET_KEY", "")),
        "youdao_configured": bool(current.get("YOUDAO_APP_KEY") and current.get("YOUDAO_SECRET_KEY")),
        "deepl_api_key_masked": _mask("DEEPL_API_KEY", current.get("DEEPL_API_KEY", "")),
        "deepl_configured": bool(current.get("DEEPL_API_KEY")),
        "ai_provider": current.get("AI_PROVIDER", ""),
        "ai_base_url": current.get("AI_BASE_URL", ""),
        "ai_api_key_masked": _mask("AI_API_KEY", current.get("AI_API_KEY", "")),
        "ai_configured": bool(current.get("AI_PROVIDER") and current.get("AI_API_KEY") and current.get("AI_MODEL")),
        "ai_model": current.get("AI_MODEL", ""),
    }


@router.patch("")
def patch_settings(payload: SettingsPatch) -> dict:
    """Update settings: empty string = clear, None = keep unchanged."""
    current = _read_env()

    mapping = {
        "OLLAMA_BASE_URL": payload.ollama_base_url,
        "OLLAMA_TIMEOUT_SECONDS": payload.ollama_timeout_seconds,
        "TRANSLATION_PROVIDER": payload.translation_provider,
        "BAIDU_TRANSLATE_APP_ID": payload.baidu_app_id,
        "BAIDU_TRANSLATE_SECRET_KEY": payload.baidu_secret_key,
        "YOUDAO_APP_KEY": payload.youdao_app_key,
        "YOUDAO_SECRET_KEY": payload.youdao_secret_key,
        "DEEPL_API_KEY": payload.deepl_api_key,
        "AI_PROVIDER": payload.ai_provider,
        "AI_BASE_URL": payload.ai_base_url,
        "AI_API_KEY": payload.ai_api_key,
        "AI_MODEL": payload.ai_model,
    }

    updates: dict[str, str] = {}
    for env_key, new_val in mapping.items():
        if new_val is None:
            continue  # unchanged
        updates[env_key] = new_val
        # Update live runtime environment immediately
        if new_val:
            os.environ[env_key] = new_val
        else:
            os.environ.pop(env_key, None)

    if updates:
        merged = {**current, **updates}
        _write_env(merged)
        # Reload config module vars
        _reload_config()

    return {"ok": True, "updated": list(updates.keys())}


def _reload_config() -> None:
    """Push updated os.environ values into the already-imported config module."""
    try:
        from .. import config
        config.OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").strip()
        config.OLLAMA_TIMEOUT_SECONDS = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120").strip() or "120")
        config.DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "").strip()
        config.BAIDU_TRANSLATE_APP_ID = os.environ.get("BAIDU_TRANSLATE_APP_ID", "").strip()
        config.BAIDU_TRANSLATE_SECRET_KEY = os.environ.get("BAIDU_TRANSLATE_SECRET_KEY", "").strip()
        config.YOUDAO_APP_KEY = os.environ.get("YOUDAO_APP_KEY", "").strip()
        config.YOUDAO_SECRET_KEY = os.environ.get("YOUDAO_SECRET_KEY", "").strip()
        config.TRANSLATION_PROVIDER = os.environ.get("TRANSLATION_PROVIDER", "auto").strip().lower()
        config.AI_PROVIDER = os.environ.get("AI_PROVIDER", "").strip()
        config.AI_BASE_URL = os.environ.get("AI_BASE_URL", "").strip()
        config.AI_API_KEY = os.environ.get("AI_API_KEY", "").strip()
        config.AI_MODEL = os.environ.get("AI_MODEL", "").strip()
    except Exception:
        pass
