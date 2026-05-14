from dataclasses import dataclass

import anthropic
import httpx

PROVIDERS = {
    "anthropic": {
        "base_url": "https://api.anthropic.com",
        "default_model": "claude-sonnet-4-20250514",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "gemini-2.5-flash",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-plus",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
    },
}


@dataclass
class LLMResponse:
    text: str


async def chat_completion(
    provider: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 500,
) -> LLMResponse:
    if provider not in PROVIDERS:
        raise ValueError(f"Unsupported provider: {provider}")

    model = model or PROVIDERS[provider]["default_model"]

    if provider == "anthropic":
        return await _call_anthropic(api_key, model, system_prompt, messages, max_tokens)
    else:
        return await _call_openai_compatible(provider, api_key, model, system_prompt, messages, max_tokens)


async def _call_anthropic(
    api_key: str,
    model: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
) -> LLMResponse:
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    )
    return LLMResponse(text=response.content[0].text)


async def _call_openai_compatible(
    provider: str,
    api_key: str,
    model: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
) -> LLMResponse:
    base_url = PROVIDERS[provider]["base_url"]

    full_messages = [{"role": "system", "content": system_prompt}] + messages

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": full_messages,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        data = response.json()
        return LLMResponse(text=data["choices"][0]["message"]["content"])
