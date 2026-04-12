from __future__ import annotations

import httpx
from fastapi import APIRouter

from ..config import DEEPL_API_KEY, DEEPL_API_URL
from ..schemas import TranslationRequest, TranslationResponse

router = APIRouter(prefix="/api/translate", tags=["translate"])


@router.post("/preview", response_model=TranslationResponse)
async def preview_translation(payload: TranslationRequest) -> TranslationResponse:
    if not DEEPL_API_KEY:
        return TranslationResponse(
            configured=False,
            provider=None,
            translation=None,
            message="未配置 DEEPL_API_KEY，当前仅保留接口。",
        )

    context_parts = [part.strip() for part in payload.context_before + [payload.text] + payload.context_after if part.strip()]
    joined_text = "\n".join(context_parts)

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            DEEPL_API_URL,
            data={
                "auth_key": DEEPL_API_KEY,
                "text": joined_text,
                "target_lang": payload.target_lang,
                "preserve_formatting": "1",
                "split_sentences": "nonewlines",
            },
        )
        response.raise_for_status()
        data = response.json()

    translations = data.get("translations") or []
    translated = translations[0].get("text") if translations else None
    return TranslationResponse(
        configured=True,
        provider="deepl",
        translation=translated,
        message=None,
    )
