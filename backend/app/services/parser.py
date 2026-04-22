from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


SPEAKER_RE = re.compile(r"^(?:\*\*)?([A-Z][A-Z0-9 .'/\-]+):(?:\*\*)?\s*(.*)$")
DIRECTION_RE = re.compile(r"^\*?\[([^\]]+)\]\*?$")
EPISODE_CODE_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
SEASON_RE = re.compile(r"Season\s+(\d+)", re.IGNORECASE)


@dataclass
class ParsedLine:
    speaker: str | None
    text: str
    is_direction: bool = False
    translation: str | None = None


@dataclass
class ParsedEpisode:
    show_name: str
    season_number: int
    episode_code: str | None
    title: str
    source_path: str
    source_url: str | None
    lines: list[ParsedLine]


def _read_text(path: Path) -> str:
    """Read text with encoding fallback."""
    # Check UTF-16 BOM first
    try:
        raw = path.read_bytes()
        if raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
            return raw.decode("utf-16")
    except Exception:  # nosec B110
        pass
    for enc in ("utf-8", "utf-8-sig", "gbk", "gb2312", "gb18030", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    # Last resort: replace invalid chars
    return path.read_text(encoding="utf-8", errors="replace")


def _clean_text(text: str) -> str:
    text = text.replace("\ufeff", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text.strip()


def _infer_episode_meta(title: str) -> tuple[str | None, int]:
    code_match = EPISODE_CODE_RE.search(title)
    episode_code = code_match.group(1).upper() if code_match else None
    season_number = 0
    if episode_code:
        season_number = int(episode_code[1:3])
    return episode_code, season_number


def _parse_dialogue_block(text: str) -> list[ParsedLine]:
    lines: list[ParsedLine] = []
    active_speaker: str | None = None

    for raw_line in _clean_text(text).splitlines():
        line = raw_line.strip()
        if not line:
            active_speaker = None
            continue

        direction_match = DIRECTION_RE.match(line)
        if direction_match:
            lines.append(ParsedLine(None, direction_match.group(1).strip(), True))
            active_speaker = None
            continue

        speaker_match = SPEAKER_RE.match(line)
        if speaker_match:
            active_speaker = speaker_match.group(1).strip()
            content = speaker_match.group(2).strip()
            if content:
                lines.append(ParsedLine(active_speaker, content, False))
            continue

        if line == "---":
            active_speaker = None
            continue

        speaker = active_speaker
        lines.append(ParsedLine(speaker, line, False))

    return lines


def _parse_markdown(path: Path) -> list[ParsedEpisode]:
    text = _clean_text(_read_text(path))
    show_name = path.stem
    season_number = 0
    source_url = None

    h1_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    if h1_match:
        h1_title = h1_match.group(1).strip()
        # Support both Chinese em-dash (—) and ASCII hyphen (-)
        separator = "—" if "—" in h1_title else ("-" if " - " in h1_title else None)
        if separator and "Season" in h1_title:
            show_name = h1_title.split(separator, 1)[0].strip()
            season_match = SEASON_RE.search(h1_title)
            if season_match:
                season_number = int(season_match.group(1))
        elif separator:
            show_name = h1_title.split(separator, 1)[0].strip()

    if re.search(r"^##\s+", text, re.MULTILINE):
        episodes: list[ParsedEpisode] = []
        matches = list(re.finditer(r"^##\s+(.+)$", text, re.MULTILINE))
        for index, match in enumerate(matches):
            title = match.group(1).strip()
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            episode_code, inferred_season = _infer_episode_meta(title)
            body_lines = _parse_dialogue_block(body)
            episodes.append(
                ParsedEpisode(
                    show_name=show_name,
                    season_number=season_number or inferred_season,
                    episode_code=episode_code,
                    title=title,
                    source_path=str(path),
                    source_url=source_url,
                    lines=body_lines,
                )
            )
        return episodes

    source_match = re.search(r"^来源：(.+)$", text, re.MULTILINE)
    if source_match:
        source_url = source_match.group(1).strip()

    title = h1_match.group(1).strip() if h1_match else path.stem
    if "—" in title:
        _, title = [part.strip() for part in title.split("—", 1)]
    elif " - " in title:
        _, title = [part.strip() for part in title.split(" - ", 1)]
    episode_code, inferred_season = _infer_episode_meta(title)
    split_marker = re.split(r"\n---\n", text, maxsplit=1)
    body = split_marker[1] if len(split_marker) == 2 else text

    return [
        ParsedEpisode(
            show_name=show_name,
            season_number=season_number or inferred_season,
            episode_code=episode_code,
            title=title,
            source_path=str(path),
            source_url=source_url,
            lines=_parse_dialogue_block(body),
        )
    ]


def _parse_txt(path: Path) -> list[ParsedEpisode]:
    text = _clean_text(_read_text(path))
    raw_lines = text.splitlines()
    show_name = raw_lines[0].strip() if raw_lines else path.parent.name
    title = raw_lines[1].strip() if len(raw_lines) > 1 else path.stem
    source_url = None

    for line in raw_lines[2:6]:
        if line.startswith("来源："):
            source_url = line.replace("来源：", "", 1).strip()
            break

    sep_index = next((i for i, line in enumerate(raw_lines) if line.startswith("=")), -1)
    body = "\n".join(raw_lines[sep_index + 1:]) if sep_index >= 0 else "\n".join(raw_lines[2:])
    episode_code, season_number = _infer_episode_meta(title)

    return [
        ParsedEpisode(
            show_name=show_name,
            season_number=season_number,
            episode_code=episode_code,
            title=title,
            source_path=str(path),
            source_url=source_url,
            lines=_parse_dialogue_block(body),
        )
    ]


def _parse_json(path: Path) -> list[ParsedEpisode]:
    payload = json.loads(_read_text(path))
    if isinstance(payload, list):
        payload = {
            "show_name": path.parent.name,
            "title": path.stem,
            "lines": payload,
        }

    title = str(payload.get("title") or path.stem)
    episode_code, inferred_season = _infer_episode_meta(title)
    raw_lines = payload.get("lines") or []
    lines = [
        ParsedLine(
            speaker=(item.get("speaker") or None),
            text=str(item.get("text") or "").strip(),
            is_direction=bool(item.get("is_direction") or item.get("direction")),
        )
        for item in raw_lines
        if str(item.get("text") or "").strip()
    ]

    return [
        ParsedEpisode(
            show_name=str(payload.get("show_name") or path.parent.name or "Imported Script"),
            season_number=int(payload.get("season_number") or inferred_season or 0),
            episode_code=str(payload.get("episode_code") or episode_code or "") or None,
            title=title,
            source_path=str(path),
            source_url=payload.get("source_url"),
            lines=lines,
        )
    ]


def _is_bilingual(first: str, second: str) -> bool:
    """Heuristic: detect if two lines are likely different languages."""
    import unicodedata

    def _cjk_ratio(s: str) -> float:
        if not s:
            return 0.0
        cjk = sum(1 for ch in s if "\u4e00" <= ch <= "\u9fff" or "\u3040" <= ch <= "\u309f" or "\u30a0" <= ch <= "\u30ff")
        return cjk / len(s)

    def _latin_ratio(s: str) -> float:
        if not s:
            return 0.0
        latin = sum(1 for ch in s if unicodedata.category(ch).startswith("L") and ch.isascii())
        return latin / len(s)

    # If one is dominantly CJK and the other dominantly Latin, treat as bilingual pair.
    return (_cjk_ratio(first) > 0.4 and _latin_ratio(second) > 0.4) or (_cjk_ratio(second) > 0.4 and _latin_ratio(first) > 0.4)


def _parse_srt(path: Path) -> list[ParsedEpisode]:
    text = _clean_text(_read_text(path))
    blocks = re.split(r"\n\s*\n", text)
    lines: list[ParsedLine] = []
    for block in blocks:
        rows = [row.strip() for row in block.splitlines() if row.strip()]
        if len(rows) < 2:
            continue
        content_rows = [row for row in rows if not row.isdigit() and "-->" not in row]
        if not content_rows:
            continue
        if len(content_rows) >= 2 and _is_bilingual(content_rows[0], content_rows[1]):
            lines.append(ParsedLine(speaker=None, text=content_rows[0], translation=content_rows[1]))
        else:
            lines.append(ParsedLine(speaker=None, text=" ".join(content_rows)))
    title = path.stem
    episode_code, season_number = _infer_episode_meta(title)
    return [
        ParsedEpisode(
            show_name=path.parent.name or "Imported Script",
            season_number=season_number,
            episode_code=episode_code,
            title=title,
            source_path=str(path),
            source_url=None,
            lines=lines,
        )
    ]


def _parse_ass(path: Path) -> list[ParsedEpisode]:
    text = _clean_text(_read_text(path))
    lines: list[ParsedLine] = []
    for row in text.splitlines():
        if not row.startswith("Dialogue:"):
            continue
        parts = row.split(",", 9)
        if len(parts) < 10:
            continue
        raw = re.sub(r"\{[^}]+\}", "", parts[9]).strip()
        # ASS uses \N for hard line breaks inside same subtitle event
        segments = [seg.strip() for seg in re.split(r"\\N", raw) if seg.strip()]
        if not segments:
            continue
        if len(segments) >= 2 and _is_bilingual(segments[0], segments[1]):
            lines.append(ParsedLine(speaker=None, text=segments[0], translation=segments[1]))
        else:
            lines.append(ParsedLine(speaker=None, text=" ".join(segments)))
    title = path.stem
    episode_code, season_number = _infer_episode_meta(title)
    return [
        ParsedEpisode(
            show_name=path.parent.name or "Imported Script",
            season_number=season_number,
            episode_code=episode_code,
            title=title,
            source_path=str(path),
            source_url=None,
            lines=lines,
        )
    ]


def _parse_fountain(path: Path) -> list[ParsedEpisode]:
    text = _clean_text(_read_text(path))
    lines: list[ParsedLine] = []
    rows = text.splitlines()
    index = 0
    while index < len(rows):
        line = rows[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("INT.") or line.startswith("EXT."):
            lines.append(ParsedLine(None, line, True))
            index += 1
            continue
        if line.isupper() and index + 1 < len(rows):
            speaker = line
            index += 1
            dialogue_buffer: list[str] = []
            while index < len(rows) and rows[index].strip():
                dialogue_buffer.append(rows[index].strip())
                index += 1
            if dialogue_buffer:
                lines.append(ParsedLine(speaker, " ".join(dialogue_buffer), False))
            continue
        lines.append(ParsedLine(None, line, False))
        index += 1

    title = path.stem
    episode_code, season_number = _infer_episode_meta(title)
    return [
        ParsedEpisode(
            show_name=path.parent.name or "Imported Script",
            season_number=season_number,
            episode_code=episode_code,
            title=title,
            source_path=str(path),
            source_url=None,
            lines=lines,
        )
    ]


def parse_file(path: Path) -> list[ParsedEpisode]:
    suffix = path.suffix.lower()
    if suffix == ".md":
        return _parse_markdown(path)
    if suffix == ".txt":
        return _parse_txt(path)
    if suffix == ".json":
        return _parse_json(path)
    if suffix == ".srt":
        return _parse_srt(path)
    if suffix == ".ass":
        return _parse_ass(path)
    if suffix == ".fountain":
        return _parse_fountain(path)
    raise ValueError(f"Unsupported file type: {path.suffix}")
