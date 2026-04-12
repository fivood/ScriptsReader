from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.ollama import chat, check_health, list_models

router = APIRouter(prefix="/api/ollama", tags=["ollama"])


class OllamaChatRequest(BaseModel):
    model: str
    task: str = "analyze"
    content: str
    target_lang: str = "中文"


class OllamaChatResponse(BaseModel):
    ok: bool
    reply: str | None = None
    error: str | None = None


@router.get("/health")
async def get_health() -> dict:
    return await check_health()


@router.get("/models")
async def get_models() -> list[dict]:
    return await list_models()


@router.post("/chat", response_model=OllamaChatResponse)
async def post_chat(payload: OllamaChatRequest) -> OllamaChatResponse:
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="content is required")
    try:
        reply = await chat(
            model=payload.model,
            task=payload.task,
            user_content=payload.content,
            target_lang=payload.target_lang,
        )
        return OllamaChatResponse(ok=True, reply=reply)
    except Exception as exc:
        return OllamaChatResponse(ok=False, error=f"{type(exc).__name__}: {exc}")
