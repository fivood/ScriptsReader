from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DialogueLine(BaseModel):
    line_index: int
    speaker: str | None = None
    text: str
    is_direction: bool = False


class EpisodeContent(BaseModel):
    id: int
    show_name: str
    season_number: int
    episode_code: str | None = None
    title: str
    source_path: str
    source_url: str | None = None
    speakers: list[str]
    lines: list[DialogueLine]


class EpisodeSummary(BaseModel):
    id: int
    episode_code: str | None = None
    title: str
    line_count: int


class SeasonSummary(BaseModel):
    id: int
    season_number: int
    episodes: list[EpisodeSummary]


class ShowSummary(BaseModel):
    id: int
    name: str
    seasons: list[SeasonSummary]


class ImportResult(BaseModel):
    imported_files: int
    imported_episodes: int
    skipped_files: list[str] = Field(default_factory=list)


class TranslationRequest(BaseModel):
    text: str
    context_before: list[str] = Field(default_factory=list)
    context_after: list[str] = Field(default_factory=list)
    target_lang: str = "ZH"
    provider: Literal["deepl"] = "deepl"


class TranslationResponse(BaseModel):
    configured: bool
    provider: str | None = None
    translation: str | None = None
    message: str | None = None


class DownloadStartRequest(BaseModel):
    target: Literal["poi", "all", "springfield", "foreverdreaming", "imsdb"]
    show_slug: str | None = None
    show_name: str | None = None
    seasons: list[int] | None = None
    all_seasons: bool = True
    index_url: str | None = None
    titles: list[str] | None = None
    download_all: bool = False
    limit: int | None = None


class DownloadJob(BaseModel):
    job_id: str
    target: str
    status: Literal["running", "finished", "failed", "canceled"]
    started_at: str
    finished_at: str | None = None
    log_path: str
    exit_code: int | None = None
    progress_text: str | None = None
    current_item: str | None = None
    last_log_line: str | None = None
    error_line: str | None = None


class AnnotationPayload(BaseModel):
    episode_id: int
    line_index: int


class HighlightUpsertRequest(AnnotationPayload):
    color: Literal["yellow", "red", "green", "blue", "purple"] | None = None


class NoteUpsertRequest(AnnotationPayload):
    content: str | None = None


class ReadingProgressUpsertRequest(BaseModel):
    episode_id: int
    last_line: int = Field(default=0, ge=0)


class ReadingProgressPayload(BaseModel):
    episode_id: int
    last_line: int
    updated_at: str
    status: Literal["unread", "in_progress", "finished"] = "unread"
