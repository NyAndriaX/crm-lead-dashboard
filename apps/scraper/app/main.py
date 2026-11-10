"""API FastAPI : scraping Google Maps normalisé pour CRM Lead Dashboard."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.auth import require_scraper_auth
from app.browser import BrowserManager
from app.config import get_settings
from app.pipeline import (
    execute_scrape,
    scrape_request_to_params,
    search_request_to_params,
)
from app.schemas import (
    ErrorResponse,
    ScrapeRequest,
    ScrapeResponse,
    SearchRequest,
)
from app.log import get_logger, setup_logging
from app.scraper import GoogleMapsScraper

logger = get_logger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    logger.info(
        "Service démarré — headless=%s timeout_scrape_ms=%s email_concurrency=%s "
        "analyse_ia=%s model=%s",
        settings.headless,
        settings.scrape_timeout_ms,
        settings.email_concurrency,
        "actif" if settings.claude_skills_enabled else "désactivé",
        settings.claude_model if settings.claude_skills_enabled else "—",
    )
    manager = BrowserManager(settings)
    app.state.browser = manager
    app.state.scraper = GoogleMapsScraper(manager, settings)
    try:
        yield
    finally:
        await manager.stop()


app = FastAPI(
    title="CRM Lead Scraper - Google Maps",
    version="0.2.0",
    description=(
        "Service Playwright qui scrape Google Maps et renvoie des leads "
        "normalisés (ScrapedLead) pour CRM Lead Dashboard."
    ),
    lifespan=lifespan,
)


@app.middleware("http")
async def log_request_start(request: Request, call_next):
    """Uvicorn n'écrit l'accès HTTP qu'à la fin — on trace le début tout de suite."""
    if request.url.path == "/health":
        return await call_next(request)
    t0 = time.perf_counter()
    client = request.client.host if request.client else "?"
    logger.info(
        ">>> %s %s depuis %s (en cours…)",
        request.method,
        request.url.path,
        client,
    )
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.exception(
            "<<< %s %s — erreur non gérée après %d ms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "<<< %s %s — HTTP %s (%d ms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _run_scrape(**params) -> ScrapeResponse:
    browser: BrowserManager = app.state.browser
    await browser.ensure_started()
    scraper: GoogleMapsScraper = app.state.scraper
    logger.info(
        "Scrape demandé — query=%r limit=%s detailed=%s locale=%s country=%s filter_country=%s",
        params.get("query"),
        params.get("limit"),
        params.get("detailed"),
        params.get("locale"),
        params.get("country"),
        params.get("filter_country"),
    )
    try:
        resp = await execute_scrape(scraper, **params)
        logger.info(
            "Scrape réussi — %s fiche(s) en %s ms",
            resp.count,
            resp.meta.duration_ms,
        )
        return resp
    except Exception as exc:  # noqa: BLE001
        logger.error("Scrape échoué : %r", exc)
        raise HTTPException(
            status_code=502, detail=f"Echec du scraping: {str(exc) or type(exc).__name__}"
        ) from exc


@app.post(
    "/scrape",
    response_model=ScrapeResponse,
    dependencies=[Depends(require_scraper_auth)],
)
async def scrape_post(req: ScrapeRequest) -> ScrapeResponse:
    """Endpoint principal CRM (Option A — HTTP pull, aligné ScrapeConfig)."""
    return await _run_scrape(**scrape_request_to_params(req))


@app.get(
    "/scrape",
    response_model=ScrapeResponse,
    dependencies=[Depends(require_scraper_auth)],
)
async def scrape_get(
    keywords: str = Query(..., min_length=2),
    city: str | None = None,
    country: str | None = None,
    limit: int = Query(20, ge=1, le=120),
    detailed: bool = True,
    locale: str | None = None,
    filter_country: bool = True,
) -> ScrapeResponse:
    req = ScrapeRequest(
        keywords=keywords,
        location={"city": city, "country": country},
        limit=limit,
        detailed=detailed,
        locale=locale,
        filter_country=filter_country,
    )
    return await _run_scrape(**scrape_request_to_params(req))


@app.post(
    "/search",
    response_model=ScrapeResponse,
    dependencies=[Depends(require_scraper_auth)],
    deprecated=True,
)
async def search_post(req: SearchRequest) -> ScrapeResponse:
    """Ancien endpoint — retourne désormais le format ScrapedLead normalisé."""
    return await _run_scrape(**search_request_to_params(req))


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    if exc.status_code == 502:
        body = ErrorResponse(ok=False, error=str(exc.detail))
        return JSONResponse(status_code=502, content=body.model_dump())
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
