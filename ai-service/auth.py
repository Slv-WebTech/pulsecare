import os

from fastapi import Header, HTTPException


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    """Gates a route behind a shared secret sent by the Express server. Fails closed:
    if AI_SERVICE_TOKEN isn't set, every request is rejected rather than let through."""
    expected = os.environ.get("AI_SERVICE_TOKEN")
    provided = authorization.removeprefix("Bearer ").strip() if authorization else None
    if not expected or not provided or provided != expected:
        raise HTTPException(status_code=401, detail="Missing or invalid service token")
