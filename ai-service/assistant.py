import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_service_token
from ollama_client import chat_json
from util import parse_json_response

router = APIRouter(dependencies=[Depends(require_service_token)])

FILTER_PROMPT = """You turn a patient's natural-language doctor search into structured filters.

Respond with ONLY a JSON object (no markdown fences, no extra text) with these keys, omitting any \
you cannot infer:

- "specialization": e.g. "Cardiologist"
- "location": city or area, if mentioned
- "maxFee": number, if a budget is mentioned
- "minExperience": number of years, if mentioned
- "language": spoken language, if mentioned
- "availableDay": one of "sunday".."saturday", if a day is mentioned (translate "this Saturday", \
"tomorrow", etc. to the weekday name)

Today's query: "{query}"
"""


class AssistantQuery(BaseModel):
    message: str


@router.post("/assistant/query")
async def parse_search_query(payload: AssistantQuery):
    try:
        text = await chat_json(FILTER_PROMPT.format(query=payload.message), max_tokens=256)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Could not reach the local Ollama server")
    except httpx.HTTPStatusError as err:
        raise HTTPException(status_code=502, detail=f"Ollama returned an error: {err.response.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama request timed out")

    try:
        return {"filters": parse_json_response(text)}
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI response was not valid JSON")
