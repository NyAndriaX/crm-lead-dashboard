"""Authentification API (Option A — CRM appelle le scraper)."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)
_api_key_header = APIKeyHeader(name="X-Api-Key", auto_error=False)


async def require_scraper_auth(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    x_api_key: str | None = Security(_api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.api_key:
        return

    token: str | None = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    elif x_api_key:
        token = x_api_key

    if not token or token != settings.api_key:
        raise HTTPException(status_code=401, detail="API key invalide ou absente")
