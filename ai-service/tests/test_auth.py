import pytest
from fastapi import HTTPException

from auth import require_service_token


def test_rejects_when_service_token_env_unset(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    with pytest.raises(HTTPException) as exc_info:
        require_service_token(authorization="Bearer anything")
    assert exc_info.value.status_code == 401


def test_rejects_missing_authorization_header(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "secret-token")
    with pytest.raises(HTTPException) as exc_info:
        require_service_token(authorization=None)
    assert exc_info.value.status_code == 401


def test_rejects_wrong_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "secret-token")
    with pytest.raises(HTTPException) as exc_info:
        require_service_token(authorization="Bearer wrong-token")
    assert exc_info.value.status_code == 401


def test_accepts_correct_bearer_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "secret-token")
    require_service_token(authorization="Bearer secret-token")  # must not raise
