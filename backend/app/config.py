from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DATA_DIR = PROJECT_ROOT / "data"
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
    IMPORTS_DIR,
]

DEEPL_API_KEY = os.getenv("DEEPL_API_KEY", "").strip()
DEEPL_API_URL = os.getenv("DEEPL_API_URL", "https://api-free.deepl.com/v2/translate").strip()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip()

# Auth token for public access – leave empty to disable authentication
AUTH_TOKEN = os.getenv("SR_AUTH_TOKEN", "").strip()
