from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import TranslationRequest, TranslationResponse, TranslationSaveRequest
from ..services.ollama import OllamaServiceError, chat as ollama_chat
from ..services.translate import save_translations

router = APIRouter(prefix="/api/translate", tags=["translate"])


@router.get("/providers")
async def list_providers() -> dict:
    """返回已配置的翻译 provider 列表（现统一走 Ollama）。"""
    return {"providers": ["ollama"], "default": "ollama"}


@router.post("/preview", response_model=TranslationResponse)
async def preview_translation(payload: TranslationRequest) -> TranslationResponse:
    context_parts = [p.strip() for p in payload.context_before + [payload.text] + payload.context_after if p.strip()]
    joined_text = "\n".join(context_parts)

    try:
        translated = await ollama_chat(
            model="",
            task="translate",
            user_content=joined_text,
            target_lang=payload.target_lang,
        )
    except OllamaServiceError as exc:
        return TranslationResponse(configured=True, provider="ollama", translation=None, message=str(exc))
    except Exception as exc:
        return TranslationResponse(configured=True, provider="ollama", translation=None, message=f"Ollama 翻译失败: {exc}")

    return TranslationResponse(
        configured=True,
        provider="ollama",
        translation=translated,
        message=None,
    )


@router.post("/save")
async def save_translation(payload: TranslationSaveRequest) -> dict:
    try:
        result = save_translations(
            payload.episode_id,
            [item.model_dump() for item in payload.translations],
        )
        return {"status": "ok", **result}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"保存失败: {exc}") from exc
