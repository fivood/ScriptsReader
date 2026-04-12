# ScriptsReader

ScriptsReader is a local script reading workspace for TV/movie dialogue study.
It provides library browsing, global search, annotations, downloader integration, translation, and local Ollama-powered analysis.

## Highlights

- FastAPI backend + static frontend, no Node build step required
- Script library index by `Show -> Season -> Episode`
- Dialogue stream with speaker filtering and in-episode search
- Global line search across all imported scripts
- Line-level annotations
  - Highlight (`yellow/red/green/blue/purple`)
  - Note editing
- Translation tools
  - Single-line translate
  - One-click translate-all for current episode
- AI tools (local Ollama)
  - Analyze / explain / rewrite / sentiment on each line
  - Episode summary
  - Character voice profile
- Unified catalog search across script sources
  - Springfield
  - IMSDb
  - ForeverDreaming (manual URL mode available)
- Downloader jobs with live status cards
  - Running/finished/failed state
  - Current item / progress text / last log line / error line

## Project Structure

```text
scriptsreader/
├── backend/
│   └── app/
│       ├── config.py
│       ├── database.py
│       ├── main.py
│       ├── routers/
│       ├── services/
│       └── static/
├── data/
│   ├── downloads/
│   ├── imports/
│   └── scriptsreader.db
├── requirements.txt
├── run.py
└── README.md
```

## Requirements

- Python 3.10+
- Network access for external script sites and translation providers
- Optional: Ollama (`http://localhost:11434`) for local AI features

## Quick Start

```powershell
cd G:\movie-scripts\scriptsreader
python -m pip install -r requirements.txt
python run.py
```

Open `http://127.0.0.1:8000`.

## Optional Configuration

### DeepL translation

```powershell
$env:DEEPL_API_KEY = "your-key"
$env:DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"
```

### Ollama endpoint

```powershell
$env:OLLAMA_BASE_URL = "http://localhost:11434"
```

## Main API Endpoints

- Library
  - `GET /api/library/shows`
  - `GET /api/library/episodes/{episode_id}`
  - `POST /api/library/rebuild`
- Imports
  - `POST /api/imports/files`
- Search
  - `GET /api/search/lines?q=...&limit=...`
- Downloads
  - `GET /api/downloads`
  - `POST /api/downloads/start`
- Catalog
  - `GET /api/catalog/status`
  - `POST /api/catalog/refresh`
  - `GET /api/catalog/search?q=...`
- Translation
  - `POST /api/translate/preview`
- Annotations
  - `GET /api/annotations/episodes/{episode_id}`
  - `PUT /api/annotations/highlight`
  - `PUT /api/annotations/note`
- Ollama
  - `GET /api/ollama/health`
  - `GET /api/ollama/models`
  - `POST /api/ollama/chat`

## Notes

- Download jobs are executed as subprocesses in unbuffered mode (`python -u`) so log progress appears in UI quickly.
- Successful download jobs automatically trigger library rebuild.
- Runtime data under `data/` is ignored by `.gitignore` by default.
