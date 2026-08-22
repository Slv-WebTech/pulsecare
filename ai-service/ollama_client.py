import os

import httpx

BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2-vision")


async def chat_json(prompt: str, images: list[str] | None = None, max_tokens: int = 512) -> str:
    """Sends a single-turn chat request to a local Ollama server and returns the
    model's raw text reply. `format: "json"` asks Ollama to constrain generation
    to valid JSON, matching the structured replies every caller expects."""
    message = {"role": "user", "content": prompt}
    if images:
        message["images"] = images

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{BASE_URL}/api/chat",
            json={
                "model": MODEL,
                "messages": [message],
                "stream": False,
                "format": "json",
                "options": {"num_predict": max_tokens},
            },
        )
    response.raise_for_status()
    return response.json()["message"]["content"]
