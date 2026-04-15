from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.ai import AiServiceError, chat, list_models

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AiChatRequest(BaseModel):
    provider: str = Field(..., description="openai | moonshot | deepseek | gemini | custom")
    model: str
    api_key: str
    base_url: str | None = None
    task: str = "analyze"
    content: str
    target_lang: str = "中文"


class AiChatResponse(BaseModel):
    ok: bool
    reply: str | None = None
    error: str | None = None


@router.get("/models")
async def get_models(provider: str, api_key: str, base_url: str | None = None) -> list[dict]:
    try:
        return await list_models(provider, api_key, base_url)
    except Exception:
        return []


@router.post("/chat", response_model=AiChatResponse)
async def post_chat(payload: AiChatRequest) -> AiChatResponse:
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="content is required")
    try:
        reply = await chat(
            provider=payload.provider,
            model=payload.model,
            api_key=payload.api_key,
            base_url=payload.base_url,
            task=payload.task,
            user_content=payload.content,
            target_lang=payload.target_lang,
        )
        return AiChatResponse(ok=True, reply=reply)
    except AiServiceError as exc:
        return AiChatResponse(ok=False, error=str(exc))
    except Exception as exc:
        return AiChatResponse(ok=False, error=f"{type(exc).__name__}: {exc}")
