"""Catalog service – scrape & cache show listings from supported sites."""

from __future__ import annotations

import json
import re
import random
import time
import threading
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from ..config import DATA_DIR

CATALOG_PATH = DATA_DIR / "catalog.json"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# ── thread-safe state ──────────────────────────────────────────────────────
_lock = threading.Lock()
_scraping = False
_progress = ""
_error: str | None = None


# ── HTTP helper ────────────────────────────────────────────────────────────
def _fetch(session: requests.Session, url: str, retries: int = 3) -> BeautifulSoup | None:
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException:
            if attempt < retries:
                time.sleep(2 * attempt)
    return None


# ── IMSDb scraper ──────────────────────────────────────────────────────────
def _scrape_imsdb(session: requests.Session) -> list[dict]:
    global _progress
    _progress = "正在获取 IMSDb 电影列表…"

    soup = _fetch(session, "https://imsdb.com/all-scripts.html")
    if not soup:
        return []

    entries: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(" ", strip=True)
        if "/Movie Scripts/" not in href or not text:
            continue
        if text in seen:
            continue
        seen.add(text)
        entries.append({
            "name": text,
            "site": "imsdb",
            "site_label": "IMSDb",
            "params": {"target": "imsdb", "titles": [text]},
        })

    _progress = f"IMSDb 完成，共 {len(entries)} 部电影"
    return entries


# ── ForeverDreaming scraper ────────────────────────────────────────────────
def _scrape_foreverdreaming(session: requests.Session) -> list[dict]:
    """ForeverDreaming uses JS-rendered pages and may block plain HTTP requests.

    Attempt to parse the main page; return empty gracefully if it fails.
    Users can still download by providing a direct forum URL through the
    advanced input.
    """
    global _progress
    _progress = "正在尝试获取 ForeverDreaming 剧集列表…"

    base = "https://transcripts.foreverdreaming.org"
    soup = _fetch(session, base)
    if not soup:
        _progress = "ForeverDreaming 跳过（站点未响应）"
        return []

    entries: list[dict] = []
    seen_ids: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "viewforum.php" not in href:
            continue
        m = re.search(r"f=(\d+)", href)
        if not m:
            continue
        fid = m.group(1)
        text = a.get_text(" ", strip=True)
        if not text or fid in seen_ids:
            continue
        seen_ids.add(fid)
        full_url = urljoin(base + "/", href)
        entries.append({
            "name": text,
            "site": "foreverdreaming",
            "site_label": "ForeverDreaming",
            "params": {
                "target": "foreverdreaming",
                "index_url": full_url,
                "show_name": text,
            },
        })

    _progress = (
        f"ForeverDreaming 完成，共 {len(entries)} 部剧"
        if entries
        else "ForeverDreaming 跳过（站点需浏览器访问，请用高级输入）"
    )
    return entries


# ── Springfield scraper ────────────────────────────────────────────────────
def _scrape_springfield(
    session: requests.Session,
    *,
    save_callback: callable | None = None,
) -> list[dict]:
    global _progress
    base = "https://www.springfieldspringfield.co.uk"
    entries: list[dict] = []
    seen_slugs: set[str] = set()
    page = 1

    # Track consecutive pages with no new entries – stop after 3 in a row.
    empty_streak = 0

    while True:
        _progress = f"Springfield 第 {page} 页（已获取 {len(entries)} 部剧）"
        url = f"{base}/tv_show_episode_scripts.php?page={page}"
        soup = _fetch(session, url)
        if not soup:
            page += 1
            if page > 600:
                break
            continue

        found_any = False
        for a in soup.find_all("a", href=re.compile(r"episode_scripts\.php\?tv-show=")):
            m = re.search(r"tv-show=([^&]+)", a.get("href", ""))
            if not m:
                continue
            slug = m.group(1)
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            name = re.sub(r"\s+", " ", a.get_text(strip=True)).strip()
            name = re.sub(r"\s*Episode Scripts$", "", name, flags=re.IGNORECASE).strip()
            if name:
                entries.append({
                    "name": name,
                    "site": "springfield",
                    "site_label": "Springfield",
                    "params": {
                        "target": "springfield",
                        "show_slug": slug,
                        "all_seasons": True,
                    },
                })
                found_any = True

        if found_any:
            empty_streak = 0
        else:
            empty_streak += 1
            if empty_streak >= 3:
                break

        # Save incrementally every 20 pages so partial results are searchable.
        if save_callback and page % 20 == 0:
            save_callback(entries)

        page += 1
        time.sleep(random.uniform(0.5, 1.0))  # nosec B311

    _progress = f"Springfield 完成，共 {len(entries)} 部剧"
    return entries


# ── persistence ────────────────────────────────────────────────────────────
def load_catalog() -> dict:
    if not CATALOG_PATH.exists():
        return {"updated_at": None, "entries": []}
    try:
        data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "entries" in data:
            return data
    except Exception:  # nosec B110
        pass
    return {"updated_at": None, "entries": []}


def _save_catalog(data: dict) -> None:
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ── background refresh ────────────────────────────────────────────────────
def _do_refresh() -> None:
    global _scraping, _progress, _error
    try:
        _error = None
        session = requests.Session()
        session.headers.update(_HEADERS)
        all_entries: list[dict] = []

        # 1. IMSDb (single page, fast)
        all_entries.extend(_scrape_imsdb(session))
        _save_catalog({"updated_at": datetime.now().isoformat(), "entries": list(all_entries)})

        # 2. ForeverDreaming
        all_entries.extend(_scrape_foreverdreaming(session))
        _save_catalog({"updated_at": datetime.now().isoformat(), "entries": list(all_entries)})

        # 3. Springfield (paginated, slow)
        def _incremental_save(springfield_entries: list[dict]) -> None:
            _save_catalog({
                "updated_at": datetime.now().isoformat(),
                "entries": all_entries + springfield_entries,
            })

        springfield = _scrape_springfield(session, save_callback=_incremental_save)
        all_entries.extend(springfield)
        _save_catalog({"updated_at": datetime.now().isoformat(), "entries": all_entries})

        _progress = f"全部完成！共 {len(all_entries)} 部"
    except Exception as exc:
        _error = str(exc)
        _progress = f"出错：{exc}"
    finally:
        _scraping = False


def refresh_catalog() -> dict:
    global _scraping
    with _lock:
        if _scraping:
            return get_catalog_status()
        _scraping = True
    threading.Thread(target=_do_refresh, daemon=True).start()
    return get_catalog_status()


# ── search ─────────────────────────────────────────────────────────────────
def search_catalog(query: str, limit: int = 80) -> list[dict]:
    catalog = load_catalog()
    q = query.strip().lower()
    if not q:
        return []

    matches = [e for e in catalog["entries"] if q in e["name"].lower()]

    # Group by case-insensitive name so multi-site results merge.
    groups: dict[str, dict] = {}
    for entry in matches:
        key = entry["name"].strip().lower()
        if key not in groups:
            groups[key] = {"name": entry["name"], "sources": []}
        groups[key]["sources"].append({
            "site": entry["site"],
            "site_label": entry["site_label"],
            "params": entry["params"],
        })

    results = sorted(groups.values(), key=lambda g: g["name"].lower())
    return results[:limit]


# ── status ─────────────────────────────────────────────────────────────────
def get_catalog_status() -> dict:
    cat = load_catalog()
    return {
        "scraping": _scraping,
        "progress": _progress,
        "error": _error,
        "updated_at": cat.get("updated_at"),
        "total_entries": len(cat.get("entries", [])),
    }
