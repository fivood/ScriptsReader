"""Unified AI service for OpenAI-compatible APIs (OpenAI, Moonshot, DeepSeek, Gemini, Custom)."""

from __future__ import annotations

import httpx

TIMEOUT_SECONDS = 120.0

# Provider presets
_PROVIDERS: dict[str, dict] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
    },
    "moonshot": {
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["kimi-k2-latest", "kimi-k1.5", "kimi-latest", "moonshot-v1-8k"],
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    },
    "custom": {
        "base_url": "",
        "models": [],
    },
}

_SYSTEM_PROMPTS: dict[str, str] = {
    "translate": (
        "You are a professional translator. Translate the dialogue line to {target_lang}. "
        "Output ONLY the translation, no explanation."
    ),
    "analyze": (
        "You are a professional screenwriting teacher. "
        "Analyze this dialogue line in depth: what is the subtext, the dramatic tension, "
        "the character's motivation, and why this line works dramatically. "
        "Answer in Chinese (简体中文), be concise but insightful (3-5 bullet points)."
    ),
    "sentiment": (
        "You are an emotion analysis expert for screenplays. "
        'For the given dialogue line, output a single JSON object with two keys: '
        '"label" (one of: 愤怒, 恐惧, 悲伤, 喜悦, 惊讶, 厌恶, 讽刺, 恳求, 冷静, 紧张, 温情, 中性) '
        'and "confidence" (0.0-1.0). Output ONLY the JSON, nothing else.'
    ),
    "explain": (
        "You are a cultural and language expert. "
        "Explain any slang, idioms, cultural references, or unusual expressions in this dialogue line. "
        "If there is nothing special, say so briefly. Answer in Chinese (简体中文)."
    ),
    "rewrite": (
        "You are a skilled screenwriter. Rewrite the following dialogue line in three different tones: "
        "formal, casual/colloquial, and emotionally intense. "
        "Output in Chinese labels: 正式版 / 口语版 / 激烈版, each on its own line."
    ),
    "profile": (
        "You are a screenwriting analyst. Based on the dialogue lines provided, "
        "create a brief voice profile of this character: their speech patterns, vocabulary level, "
        "emotional tendencies, signature phrases, and personality traits revealed through dialogue. "
        "Answer in Chinese (简体中文), using bullet points."
    ),
    "summary": (
        "You are a professional script reader. Summarize the plot of this episode "
        "based on the dialogue provided. Keep it concise (3-5 sentences). "
        "Answer in Chinese (简体中文)."
    ),
}


class AiServiceError(RuntimeError):
    """Raised when the AI provider returns an error or is unreachable."""


def _get_system_prompt(task: str, target_lang: str = "中文") -> str:
    template = _SYSTEM_PROMPTS.get(task, _SYSTEM_PROMPTS["analyze"])
    return template.format(target_lang=target_lang) if "{" in template else template


def _resolve_base_url(provider: str, base_url: str | None) -> str:
    url = (base_url or "").strip()
    if url:
        return url.rstrip("/")
    preset = _PROVIDERS.get(provider, _PROVIDERS["custom"])
    return preset["base_url"].rstrip("/")


async def list_models(provider: str, api_key: str, base_url: str | None = None) -> list[dict]:
    """Try to fetch model list from provider's /v1/models; fallback to preset list."""
    url = _resolve_base_url(provider, base_url)
    if not url or not api_key:
        preset = _PROVIDERS.get(provider, _PROVIDERS["custom"])
        return [{"id": m, "name": m} for m in preset["models"]]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            remote_models = data.get("data", [])
            if remote_models:
                return [{"id": m.get("id", m.get("name", "")), "name": m.get("id", m.get("name", ""))} for m in remote_models]
    except Exception:
        pass

    preset = _PROVIDERS.get(provider, _PROVIDERS["custom"])
    return [{"id": m, "name": m} for m in preset["models"]]


async def chat(
    provider: str,
    model: str,
    api_key: str,
    base_url: str | None,
    task: str,
    user_content: str,
    target_lang: str = "中文",
) -> str:
    """Send a chat request to the selected AI provider and return the assistant reply."""
    url = _resolve_base_url(provider, base_url)
    if not url:
        raise AiServiceError("未配置 Base URL，请在设置中填写")
    if not api_key:
        raise AiServiceError("未配置 API Key，请在设置中填写")
    if not model:
        raise AiServiceError("未选择模型，请在设置中检测并选择模型")

    system = _get_system_prompt(task, target_lang=target_lang)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            try:
                detail = resp.json().get("error", {}).get("message", str(exc))
            except Exception:
                detail = str(exc)
            raise AiServiceError(f"AI 接口错误: {detail}")

        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise AiServiceError("AI 返回空 choices，请检查模型是否可用")
        text = choices[0].get("message", {}).get("content", "").strip()
        if not text:
            raise AiServiceError("AI 返回空响应，请检查模型是否可用")
        return text
