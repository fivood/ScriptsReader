"""Ollama integration service – local LLM for script analysis tasks."""

from __future__ import annotations

import httpx

from ..config import OLLAMA_BASE_URL, OLLAMA_TIMEOUT_SECONDS


class OllamaServiceError(RuntimeError):
    """Raised when Ollama is unreachable or returns an unexpected payload."""

# ── Prompt templates per task ──────────────────────────────────────────────

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
        "For the given dialogue line, output a single JSON object with two keys: "
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


def _get_system_prompt(task: str, **kwargs: str) -> str:
    template = _SYSTEM_PROMPTS.get(task, _SYSTEM_PROMPTS["analyze"])
    return template.format(**kwargs) if "{" in template else template


# ── Ollama HTTP helpers ────────────────────────────────────────────────────

async def list_models() -> list[dict]:
    """Return locally available Ollama models."""
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        resp.raise_for_status()
        data = resp.json()
        models = data.get("models", [])
        return [
            {
                "name": m["name"],
                "size": m.get("size", 0),
                "modified_at": m.get("modified_at", ""),
            }
            for m in models
        ]


async def check_health() -> dict:
    """Check if Ollama is reachable."""
    try:
        models = await list_models()
        return {
            "online": True,
            "base_url": OLLAMA_BASE_URL,
            "models": len(models),
            "error": None,
        }
    except Exception as exc:
        return {
            "online": False,
            "base_url": OLLAMA_BASE_URL,
            "models": 0,
            "error": f"{type(exc).__name__}: {exc}",
        }


async def _resolve_model(model: str) -> str:
    if model.strip():
        return model.strip()
    models = await list_models()
    if not models:
        raise OllamaServiceError(
            "未检测到可用模型。请先执行: ollama pull qwen2.5:7b 或其它模型"
        )
    return str(models[0]["name"])


async def chat(
    model: str,
    task: str,
    user_content: str,
    *,
    target_lang: str = "中文",
    stream: bool = False,
) -> str:
    """Send a chat request to Ollama and return the assistant reply."""
    chosen_model = await _resolve_model(model)
    system = _get_system_prompt(task, target_lang=target_lang)

    payload = {
        "model": chosen_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "stream": stream,
    }

    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
            text = data.get("message", {}).get("content", "").strip()
            if text:
                return text
        except httpx.HTTPStatusError as exc:
            # Some installations only support /api/generate or return model-not-found.
            if exc.response.status_code not in (400, 404):
                raise OllamaServiceError(f"Ollama 接口错误: {exc.response.status_code}") from exc

        prompt = f"[System]\n{system}\n\n[User]\n{user_content}"
        gen_resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": chosen_model, "prompt": prompt, "stream": False},
        )
        gen_resp.raise_for_status()
        gen_data = gen_resp.json()
        text = str(gen_data.get("response", "")).strip()
        if not text:
            raise OllamaServiceError("Ollama 返回空响应，请检查模型是否可用")
        return text
