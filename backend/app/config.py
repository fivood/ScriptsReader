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
    # 统一剧本库目录
    WORKSPACE_ROOT / "scripts_library",
    # 手动上传/导入目录
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

# AI Provider settings
AI_PROVIDER = os.getenv("AI_PROVIDER", "").strip()
AI_BASE_URL = os.getenv("AI_BASE_URL", "").strip()
AI_API_KEY = os.getenv("AI_API_KEY", "").strip()
AI_MODEL = os.getenv("AI_MODEL", "").strip()


def get_version() -> str:
    """Get version from version.txt or environment, fallback to default."""
    if VERSION_FILE.exists():
        try:
            content = VERSION_FILE.read_text(encoding="utf-8").strip()
            if content:
                return content
        except Exception:  # nosec B110
            pass
    return os.getenv("APP_VERSION", "0.1.0").strip()
