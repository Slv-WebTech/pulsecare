"""Endpoint tests with Ollama and Cloudinary mocked: no network, no model, no credentials."""
import base64

import httpx
import pymupdf
import pytest
from fastapi.testclient import TestClient

import assistant
import summarizer
from main import app

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
GOOD_URL = "https://res.cloudinary.com/demo/raw/authenticated/s--x--/v1/doc.pdf"
SUMMARY_JSON = (
    '{"documentType":"Lab Report","keyInfo":"All normal.","abnormalValues":null,'
    '"followUp":null,"disclaimer":"This summary is for informational purposes only and is not medical advice."}'
)


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", TOKEN)


@pytest.fixture
def client():
    return TestClient(app)


def pdf_bytes(pages):
    doc = pymupdf.open()
    for _ in range(pages):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def mock_cloudinary(monkeypatch, body=b"x", status=200):
    """Make summarizer.fetch_file's httpx client talk to an in-memory transport."""
    transport = httpx.MockTransport(lambda request: httpx.Response(status, content=body))
    real = httpx.AsyncClient
    monkeypatch.setattr(summarizer.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))


def mock_ollama(monkeypatch, module, reply=None, exc=None):
    async def fake(prompt, images=None, max_tokens=512):
        fake.calls.append({"prompt": prompt, "images": images})
        if exc:
            raise exc
        return reply

    fake.calls = []
    monkeypatch.setattr(module, "chat_json", fake)
    return fake


# ---------- auth ----------

@pytest.mark.parametrize(
    "path,body",
    [("/summarize", {"fileUrl": GOOD_URL, "fileType": "application/pdf"}), ("/assistant/query", {"message": "x"})],
)
def test_service_token_required(client, path, body):
    assert client.post(path, json=body).status_code == 401
    assert client.post(path, json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_health_is_public(client):
    assert client.get("/health").json() == {"status": "ok"}


# ---------- assistant ----------

def test_assistant_returns_filters(client, monkeypatch):
    fake = mock_ollama(monkeypatch, assistant, '{"specialization":"Cardiologist","location":"Pune","maxFee":500}')
    r = client.post("/assistant/query", json={"message": "cardiologist in pune under 500"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json() == {"filters": {"specialization": "Cardiologist", "location": "Pune", "maxFee": 500}}
    assert "cardiologist in pune under 500" in fake.calls[0]["prompt"]


def test_assistant_accepts_fenced_json(client, monkeypatch):
    mock_ollama(monkeypatch, assistant, '```json\n{"language":"Hindi"}\n```')
    r = client.post("/assistant/query", json={"message": "hindi speaking doctor"}, headers=AUTH)
    assert r.json()["filters"] == {"language": "Hindi"}


@pytest.mark.parametrize(
    "exc,status",
    [
        (httpx.ConnectError("down"), 502),
        (httpx.ReadTimeout("slow"), 504),
        (httpx.HTTPStatusError("bad", request=httpx.Request("POST", "http://o"), response=httpx.Response(500)), 502),
    ],
)
def test_assistant_maps_ollama_failures(client, monkeypatch, exc, status):
    mock_ollama(monkeypatch, assistant, exc=exc)
    assert client.post("/assistant/query", json={"message": "x"}, headers=AUTH).status_code == status


def test_assistant_garbage_reply_is_502(client, monkeypatch):
    mock_ollama(monkeypatch, assistant, "not json at all")
    assert client.post("/assistant/query", json={"message": "x"}, headers=AUTH).status_code == 502


def test_assistant_rejects_missing_message(client):
    assert client.post("/assistant/query", json={}, headers=AUTH).status_code == 422


# ---------- summarizer ----------

def test_summarize_image_end_to_end(client, monkeypatch):
    mock_cloudinary(monkeypatch, body=b"\x89PNG fake")
    fake = mock_ollama(monkeypatch, summarizer, SUMMARY_JSON)
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "image/png"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["documentType"] == "Lab Report"
    assert "truncated" not in r.json()  # only PDFs report page counts
    assert fake.calls[0]["images"] == [base64.b64encode(b"\x89PNG fake").decode()]
    assert "Do not diagnose" in fake.calls[0]["prompt"]


def test_summarize_pdf_reports_truncation(client, monkeypatch):
    mock_cloudinary(monkeypatch, body=pdf_bytes(summarizer.MAX_PDF_PAGES + 4))
    fake = mock_ollama(monkeypatch, summarizer, SUMMARY_JSON)
    body = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "application/pdf"}, headers=AUTH).json()
    assert body["pagesRead"] == summarizer.MAX_PDF_PAGES
    assert body["totalPages"] == summarizer.MAX_PDF_PAGES + 4
    assert body["truncated"] is True
    assert len(fake.calls[0]["images"]) == summarizer.MAX_PDF_PAGES


def test_summarize_short_pdf_not_truncated(client, monkeypatch):
    mock_cloudinary(monkeypatch, body=pdf_bytes(2))
    mock_ollama(monkeypatch, summarizer, SUMMARY_JSON)
    body = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "application/pdf"}, headers=AUTH).json()
    assert (body["pagesRead"], body["totalPages"], body["truncated"]) == (2, 2, False)


@pytest.mark.parametrize(
    "url",
    [
        "http://res.cloudinary.com/demo/x.pdf",  # not https
        "https://evil.example/x.pdf",
        "https://res.cloudinary.com.evil.example/x.pdf",
        "http://169.254.169.254/latest/meta-data",
        "file:///etc/passwd",
        "ftp://res.cloudinary.com/x.pdf",
    ],
)
def test_summarize_ssrf_guard(client, monkeypatch, url):
    mock_ollama(monkeypatch, summarizer, SUMMARY_JSON)
    r = client.post("/summarize", json={"fileUrl": url, "fileType": "application/pdf"}, headers=AUTH)
    assert r.status_code == 400


def test_summarize_oversized_document_is_413(client, monkeypatch):
    mock_cloudinary(monkeypatch, body=b"0" * (summarizer.MAX_FILE_BYTES + 1))
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "image/png"}, headers=AUTH)
    assert r.status_code == 413


def test_summarize_upstream_failure_is_502(client, monkeypatch):
    mock_cloudinary(monkeypatch, status=404)
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "image/png"}, headers=AUTH)
    assert r.status_code == 502


def test_summarize_corrupt_pdf_is_422(client, monkeypatch):
    mock_cloudinary(monkeypatch, body=b"definitely not a pdf")
    mock_ollama(monkeypatch, summarizer, SUMMARY_JSON)
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "application/pdf"}, headers=AUTH)
    assert r.status_code == 422


@pytest.mark.parametrize("exc,status", [(httpx.ConnectError("x"), 502), (httpx.ReadTimeout("x"), 504)])
def test_summarize_maps_ollama_failures(client, monkeypatch, exc, status):
    mock_cloudinary(monkeypatch, body=b"img")
    mock_ollama(monkeypatch, summarizer, exc=exc)
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "image/png"}, headers=AUTH)
    assert r.status_code == status


@pytest.mark.parametrize("reply", ["nope", "[1, 2, 3]"])
def test_summarize_non_object_reply_is_502(client, monkeypatch, reply):
    mock_cloudinary(monkeypatch, body=b"img")
    mock_ollama(monkeypatch, summarizer, reply)
    r = client.post("/summarize", json={"fileUrl": GOOD_URL, "fileType": "image/png"}, headers=AUTH)
    assert r.status_code == 502
