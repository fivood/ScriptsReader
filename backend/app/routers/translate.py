from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import (
    BAIDU_TRANSLATE_APP_ID, BAIDU_TRANSLATE_SECRET_KEY,
    DEEPL_API_KEY, DEEPL_API_URL,
    TRANSLATION_PROVIDER,
    YOUDAO_APP_KEY, YOUDAO_SECRET_KEY,
)
from ..schemas import TranslationRequest, TranslationResponse
from ..services.translate import translate_baidu, translate_deepl, translate_youdao

router = APIRouter(prefix="/api/translate", tags=["translate"])


def _resolve_provider(requested: str) -> str | None:
    """返回实际可用的 provider 名，无可用配置时返回 None"""
    order = (
        [requested] if requested != "auto"
        else ([TRANSLATION_PROVIDER] if TRANSLATION_PROVIDER != "auto" else ["deepl", "baidu", "youdao"])
    )
    for p in order:
        if p == "deepl" and DEEPL_API_KEY:
            return "deepl"
        if p == "baidu" and BAIDU_TRANSLATE_APP_ID and BAIDU_TRANSLATE_SECRET_KEY:
            return "baidu"
        if p == "youdao" and YOUDAO_APP_KEY and YOUDAO_SECRET_KEY:
            return "youdao"
    return None


@router.get("/providers")
async def list_providers() -> dict:
    """返回已配置的翻译 provider 列表"""
    available = []
    if DEEPL_API_KEY:
        available.append("deepl")
    if BAIDU_TRANSLATE_APP_ID and BAIDU_TRANSLATE_SECRET_KEY:
        available.append("baidu")
    if YOUDAO_APP_KEY and YOUDAO_SECRET_KEY:
        available.append("youdao")
    return {"providers": available, "default": TRANSLATION_PROVIDER}


@router.post("/preview", response_model=TranslationResponse)
async def preview_translation(payload: TranslationRequest) -> TranslationResponse:
    provider = _resolve_provider(payload.provider)
    if not provider:
        return TranslationResponse(
            configured=False,
            provider=None,
            translation=None,
            message="未配置任何翻译服务。请在 .env 中配置 BAIDU_TRANSLATE_APP_ID/SECRET_KEY（百度）、YOUDAO_APP_KEY/SECRET_KEY（有道）或 DEEPL_API_KEY（DeepL）。",
        )

    context_parts = [p.strip() for p in payload.context_before + [payload.text] + payload.context_after if p.strip()]
    joined_text = "\n".join(context_parts)

    try:
        if provider == "deepl":
            translated = await translate_deepl(joined_text, DEEPL_API_KEY, DEEPL_API_URL, payload.target_lang)
        elif provider == "baidu":
            translated = await translate_baidu(joined_text, BAIDU_TRANSLATE_APP_ID, BAIDU_TRANSLATE_SECRET_KEY, payload.target_lang)
        elif provider == "youdao":
            translated = await translate_youdao(joined_text, YOUDAO_APP_KEY, YOUDAO_SECRET_KEY, payload.target_lang)
        else:
            raise HTTPException(status_code=400, detail=f"未知 provider: {provider}")
    except RuntimeError as e:
        return TranslationResponse(configured=True, provider=provider, translation=None, message=str(e))

    return TranslationResponse(
        configured=True,
        provider=provider,
        translation=translated,
        message=None,
    )
