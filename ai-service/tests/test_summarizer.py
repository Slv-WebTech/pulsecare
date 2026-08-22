import asyncio
import base64

import pymupdf
import pytest
from fastapi import HTTPException

from summarizer import MAX_PDF_PAGES, build_images, fetch_file


def _make_pdf_bytes(num_pages):
    doc = pymupdf.open()
    for _ in range(num_pages):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def test_build_images_passes_non_pdf_through_as_base64():
    raw = b"fake-image-bytes"
    images = build_images(raw, "image/png")
    assert images == [base64.b64encode(raw).decode("utf-8")]


def test_build_images_rasterizes_every_pdf_page():
    pdf_bytes = _make_pdf_bytes(3)
    images = build_images(pdf_bytes, "application/pdf")
    assert len(images) == 3
    for image in images:
        base64.b64decode(image)  # each entry must be valid base64


def test_build_images_caps_at_max_pdf_pages():
    pdf_bytes = _make_pdf_bytes(MAX_PDF_PAGES + 5)
    images = build_images(pdf_bytes, "application/pdf")
    assert len(images) == MAX_PDF_PAGES


def test_fetch_file_rejects_disallowed_host_before_any_network_call():
    # res.cloudinary.com is the only allowed host — anything else must be
    # rejected by the SSRF guard before fetch_file ever opens a connection.
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(fetch_file("https://evil.example.com/file.pdf"))
    assert exc_info.value.status_code == 400
