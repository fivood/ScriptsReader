from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DATA_DIR = PROJECT_ROOT / "data"
VERSION_FILE = DATA_DIR / "version.txt"
IMPORTS_DIR = DATA_DIR / "imports"
LIBRARY_DIR = DATA_DIR / "library"
DOWNLOAD_LOG_DIR = DATA_DIR / "downloads"
DOWNLOAD_PRESETS_PATH = DATA_DIR / "download_presets.json"
DATABASE_PATH = DATA_DIR / "scriptsreader.db"
STATIC_DIR = Path(__file__).resolve().parent / "static"

SUPPORTED_IMPORT_EXTENSIONS = {".md", ".txt", ".json", ".srt", ".ass", ".fountain"}
DEFAULT_LIBRARY_SOURCES = [
    WORKSPACE_ROOT / "poi_scripts_md",
    WORKSPACE_ROOT / "all_scripts_md",
    WORKSPACE_ROOT / "springfield_scripts_md",
    WORKSPACE_ROOT / "foreverdreaming_scripts_md",
    WORKSPACE_ROOT / "imsdb_movies_md",
    WORKSPACE_ROOT / "poi_scripts",
    WORKSPACE_ROOT / "all_scripts",
    IMPORTS_DIR,
]

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY", "").strip()
DEEPL_API_URL = os.getenv("DEEPL_API_URL", "https://api-free.deepl.com/v2/translate").strip()

# 百度翻译 API（国内可用，https://fanyi-api.baidu.com）
BAIDU_TRANSLATE_APP_ID = os.getenv("BAIDU_TRANSLATE_APP_ID", "").strip()
BAIDU_TRANSLATE_SECRET_KEY = os.getenv("BAIDU_TRANSLATE_SECRET_KEY", "").strip()

# 有道智云翻译 API（国内可用，https://ai.youdao.com）
YOUDAO_APP_KEY = os.getenv("YOUDAO_APP_KEY", "").strip()
YOUDAO_SECRET_KEY = os.getenv("YOUDAO_SECRET_KEY", "").strip()

# 翻译 Provider 优先级：auto = 自动选择第一个已配置的
TRANSLATION_PROVIDER = os.getenv("TRANSLATION_PROVIDER", "auto").strip().lower()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip()
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120").strip() or "120")

# Auth token for public access – leave empty to disable authentication
AUTH_TOKEN = os.getenv("SR_AUTH_TOKEN", "").strip()


def get_version() -> str:
    """Get version from version.txt or environment, fallback to default."""
    if VERSION_FILE.exists():
        try:
            content = VERSION_FILE.read_text(encoding="utf-8").strip()
            if content:
                return content
        except Exception:
            pass
    return os.getenv("APP_VERSION", "0.1.0").strip()
