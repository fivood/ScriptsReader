from __future__ import annotations

import hashlib
import random
import time
import uuid

import httpx


async def translate_deepl(text: str, api_key: str, api_url: str, target_lang: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            api_url,
            data={
                "auth_key": api_key,
                "text": text,
                "target_lang": target_lang,
                "preserve_formatting": "1",
                "split_sentences": "nonewlines",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    translations = data.get("translations") or []
    return translations[0].get("text", "") if translations else ""


async def translate_baidu(text: str, app_id: str, secret_key: str, target_lang: str) -> str:
    """百度翻译 API (https://fanyi-api.baidu.com)"""
    # 百度使用 zh 表示简体中文
    to_lang = "zh" if target_lang.upper().startswith("ZH") else target_lang.lower()
    salt = str(random.randint(10000, 99999))
    sign_raw = app_id + text + salt + secret_key
    sign = hashlib.md5(sign_raw.encode("utf-8")).hexdigest()

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            "https://fanyi-api.baidu.com/api/trans/vip/translate",
            params={
                "q": text,
                "from": "auto",
                "to": to_lang,
                "appid": app_id,
                "salt": salt,
                "sign": sign,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    if "error_code" in data:
        raise RuntimeError(f"百度翻译错误 {data['error_code']}: {data.get('error_msg', '')}")

    results = data.get("trans_result") or []
    return "\n".join(item.get("dst", "") for item in results)


async def translate_youdao(text: str, app_key: str, secret_key: str, target_lang: str) -> str:
    """有道智云批量翻译 API (https://openapi.youdao.com/v2/api)"""
    # 有道使用 zh-CHS 表示简体中文
    to_lang = "zh-CHS" if target_lang.upper().startswith("ZH") else target_lang

    curtime = str(int(time.time()))
    # 文档建议 salt 使用 UUID，防止重放攻击
    salt = str(uuid.uuid4())

    # 批量接口签名：input = 所有q拼接后的截断字符串
    # input = q前10字符 + q总长度 + q后10字符（长度>20时），否则直接用q
    if len(text) > 20:
        input_str = text[:10] + str(len(text)) + text[-10:]
    else:
        input_str = text

    sign_raw = app_key + input_str + salt + curtime + secret_key
    sign = hashlib.sha256(sign_raw.encode("utf-8")).hexdigest()

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://openapi.youdao.com/v2/api",
            data={
                "q": text,
                "from": "auto",
                "to": to_lang,
                "appKey": app_key,
                "salt": salt,
                "sign": sign,
                "signType": "v3",
                "curtime": curtime,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    error_code = data.get("errorCode", "0")
    if error_code != "0":
        raise RuntimeError(f"有道翻译错误 {error_code}")

    # v2/api 返回 translateResults（对象数组），每项包含 translation 字段
    results = data.get("translateResults") or []
    return "\n".join(item.get("translation", "") for item in results)
