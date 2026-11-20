import base64
import json
from urllib.parse import urlparse

import httpx
import pymupdf
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_service_token
from ollama_client import chat_json
from util import parse_json_response

router = APIRouter(dependencies=[Depends(require_service_token)])

SUMMARY_PROMPT = """You are assisting with a patient's medical document. Read the attached \
document and respond with ONLY a JSON object (no markdown fences, no extra text) with these keys:

- "documentType": short label, e.g. "Lab Report", "Prescription", "Discharge Summary"
- "keyInfo": 2-4 sentence plain-language summary a non-clinician can understand
- "abnormalValues": any values/findings flagged as outside normal range, or null if none
- "followUp": suggested next step (e.g. "Discuss with your doctor"), or null if none
- "disclaimer": the fixed string "This summary is for informational purposes only and is not medical advice."

Do not diagnose. Do not recommend medication changes. If the document is unreadable, set every \
field to null except "documentType" set to "Unreadable" and "disclaimer" as specified above.
"""

# Ollama has no native PDF support, so PDFs are rasterized page-by-page for the vision
# model; capped to keep very long documents from blowing up the request/context size.
MAX_PDF_PAGES = 8

# Documents are only ever uploaded to Cloudinary (server/src/config/cloudinary.js), so
# fileUrl should never point anywhere else — this is the SSRF guard for this endpoint.
ALLOWED_FILE_HOSTS = {"res.cloudinary.com"}

# Matches the multer upload limit on the server side (upload.middleware.js).
MAX_FILE_BYTES = 10 * 1024 * 1024


class SummarizeRequest(BaseModel):
    fileUrl: str
    fileType: str


def count_pdf_pages(file_bytes: bytes) -> int:
    with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
        return len(doc)


def build_images(file_bytes: bytes, file_type: str) -> list[str]:
    if file_type != "application/pdf":
        return [base64.b64encode(file_bytes).decode("utf-8")]

    images = []
    with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
        for page_number in range(min(len(doc), MAX_PDF_PAGES)):
            pixmap = doc.load_page(page_number).get_pixmap()
            images.append(base64.b64encode(pixmap.tobytes("png")).decode("utf-8"))
    return images


async def fetch_file(file_url: str) -> bytes:
    parsed = urlparse(file_url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_FILE_HOSTS:
        raise HTTPException(status_code=400, detail="fileUrl host is not allowed")

    async with httpx.AsyncClient(timeout=30) as http_client:
        async with http_client.stream("GET", file_url) as response:
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Could not fetch document")

            chunks = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="Document exceeds the 10MB size limit")
                chunks.append(chunk)
            return b"".join(chunks)


@router.post("/summarize")
async def summarize_document(payload: SummarizeRequest):
    file_bytes = await fetch_file(payload.fileUrl)

    total_pages = None
    try:
        images = build_images(file_bytes, payload.fileType)
        if payload.fileType == "application/pdf":
            total_pages = count_pdf_pages(file_bytes)
    except RuntimeError:
        raise HTTPException(status_code=422, detail="Could not read the document (corrupt or unsupported file)")

    try:
        text = await chat_json(SUMMARY_PROMPT, images=images, max_tokens=1024)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Could not reach the local Ollama server")
    except httpx.HTTPStatusError as err:
        raise HTTPException(status_code=502, detail=f"Ollama returned an error: {err.response.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama request timed out")

    try:
        summary = parse_json_response(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI response was not valid JSON")

    if not isinstance(summary, dict):
        raise HTTPException(status_code=502, detail="AI response was not a JSON object")

    # Tell the caller when a long PDF was only partially read instead of truncating silently.
    if total_pages is not None:
        summary["pagesRead"] = len(images)
        summary["totalPages"] = total_pages
        summary["truncated"] = total_pages > len(images)
    return summary
