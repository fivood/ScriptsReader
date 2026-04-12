"""Ollama integration service – local LLM for script analysis tasks."""

from __future__ import annotations

import httpx

from ..config import OLLAMA_BASE_URL

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
    return template.format_map({**kwargs, **{k: k for k in [] }}) if "{" in template else template


# ── Ollama HTTP helpers ────────────────────────────────────────────────────

async def list_models() -> list[dict]:
    """Return locally available Ollama models."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
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
    except Exception:
        return []


async def check_health() -> dict:
    """Check if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/")
            return {"online": resp.status_code == 200}
    except Exception:
        return {"online": False}


async def chat(
    model: str,
    task: str,
    user_content: str,
    *,
    target_lang: str = "中文",
    stream: bool = False,
) -> str:
    """Send a chat request to Ollama and return the assistant reply."""
    system = _get_system_prompt(task, target_lang=target_lang)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "stream": stream,
    }

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "").strip()
