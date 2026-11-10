"""Orchestration scrape → normalisation → dédup → filtre géo."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from typing import Any

from app.claude_skills import AI_SETTINGS
from app.config import get_settings
from app.rate import CURRENT_RATE, RateSettings, resolve_rate
from app.robots import CURRENT_ROBOTS_REPORT, RobotsReport
from app.log import get_logger, log_step

from app.normalizer import (
    build_maps_query,
    deduplicate_leads,
    filter_by_country,
    normalize_batch,
)
from app.schemas import (
    AiSettings,
    ScrapeMeta,
    ScrapeRate,
    ScrapeRequest,
    ScrapeResponse,
    ScrapedLead,
    SearchRequest,
)
from app.scraper import GoogleMapsScraper

logger = get_logger("pipeline")


async def execute_scrape(
    scraper: GoogleMapsScraper,
    *,
    query: str,
    limit: int,
    detailed: bool,
    locale: str | None,
    country: str | None,
    filter_country: bool,
    queries: list[str] | None = None,
    target: str | None = None,
    ai: AiSettings | None = None,
    rate: ScrapeRate | None = None,
    sector_sites: list[str] | None = None,
) -> ScrapeResponse:
    # Fournisseur d'IA, débit (proxy / user-agent / délai) et bilan robots.txt de la mission :
    # variables de contexte héritées par les visites parallèles.
    rate_settings = resolve_rate(rate, get_settings())
    report = RobotsReport()
    token = AI_SETTINGS.set(ai)
    rate_token = CURRENT_RATE.set(rate_settings)
    robots_token = CURRENT_ROBOTS_REPORT.set(report)
    try:
        return await _execute_scrape(
            scraper, query=query, limit=limit, detailed=detailed, locale=locale, country=country,
            filter_country=filter_country, queries=queries, target=target, ai=ai,
            rate=rate_settings, sector_sites=sector_sites, report=report,
        )
    finally:
        CURRENT_ROBOTS_REPORT.reset(robots_token)
        CURRENT_RATE.reset(rate_token)
        AI_SETTINGS.reset(token)


async def _execute_scrape(
    scraper: GoogleMapsScraper,
    *,
    query: str,
    limit: int,
    detailed: bool,
    locale: str | None,
    country: str | None,
    filter_country: bool,
    queries: list[str] | None,
    target: str | None,
    ai: AiSettings | None,
    rate: RateSettings,
    sector_sites: list[str] | None,
    report: RobotsReport,
) -> ScrapeResponse:
    started = time.perf_counter()
    scraped_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )

    settings = get_settings()
    logger.info(
        "Pipeline — query=%r requêtes=%s limit=%s detailed=%s cible=%s timeout_ms=%s",
        query,
        len(queries or [query]),
        limit,
        detailed,
        "oui" if target else "non",
        settings.scrape_timeout_ms,
    )
    if ai is not None:
        logger.info("Analyse IA : fournisseur %s%s", ai.provider, "" if ai.enabled else " (désactivé)")
    logger.info("Débit : %s", rate.describe())
    if sector_sites:
        logger.info("Sites sectoriels : %s page(s) de départ", len(sector_sites))
    if settings.robots_txt_enforce:
        logger.info(
            "robots.txt respecté pour les sites visités (jeton %s) — non appliqué à la collecte Google Maps",
            settings.robots_user_agent.split("/")[0],
        )

    search_coro = scraper.search(
        query=queries or query,
        max_results=limit,
        detailed=detailed,
        locale=locale,
        target=target,
        rate=rate,
        sector_sites=sector_sites,
    )
    timeout_s = settings.scrape_timeout_ms / 1000
    with log_step(logger, "Google Maps + emails"):
        if settings.scrape_timeout_ms > 0:
            logger.info(
                "Limite globale : %d s (SCRAPER_TIMEOUT_MS)", int(timeout_s)
            )
            try:
                places = await asyncio.wait_for(search_coro, timeout=timeout_s)
            except TimeoutError as exc:
                raise RuntimeError(
                    f"Scraping interrompu après {int(timeout_s)}s "
                    f"(SCRAPER_TIMEOUT_MS={settings.scrape_timeout_ms})"
                ) from exc
        else:
            places = await search_coro

    logger.info("%s établissement(s) brut(s) récupéré(s)", len(places))

    defaults: dict[str, Any] = {}
    if country:
        defaults["country"] = country

    leads = normalize_batch(
        places,
        query=query,
        defaults=defaults,
        scraped_at=scraped_at,
    )
    leads = deduplicate_leads(leads)
    logger.info("%s lead(s) après normalisation + dédup", len(leads))

    filters_applied: list[str] = []
    if filter_country and country:
        before = len(leads)
        leads, filters_applied = filter_by_country(leads, country)
        logger.info(
            "Filtre pays %r : %s → %s fiche(s)",
            country,
            before,
            len(leads),
        )

    with_email = sum(1 for l in leads if l.email)
    with_contact = sum(1 for l in leads if l.name)
    analyzed = sum(1 for l in leads if l.ai)
    duration_ms = int((time.perf_counter() - started) * 1000)
    robots_meta = report.as_meta() if settings.robots_txt_enforce else {"enforced": False}
    if report.disallowed:
        logger.info("robots.txt : %s page(s) ignorée(s)", len(report.disallowed))
    sources: dict[str, int] = {}
    for lead in leads:
        sources[lead.source] = sources.get(lead.source, 0) + 1
    logger.info(
        "Pipeline terminé — %s fiche(s), %s avec email, %s décideur(s), %s analysée(s) par IA, durée %s ms",
        len(leads),
        with_email,
        with_contact,
        analyzed,
        duration_ms,
    )

    return ScrapeResponse(
        ok=True,
        query=query,
        count=len(leads),
        source="google_maps",
        scraped_at=scraped_at,
        results=leads,
        meta=ScrapeMeta(
            duration_ms=duration_ms,
            filters_applied=filters_applied,
            robots=robots_meta,
            rate={
                "delay_ms": rate.delay_ms,
                "rotate_user_agent": rate.rotate_user_agent,
                "proxy": rate.proxy_label,
                "origin": rate.origin,
            },
            sources=sources,
        ),
    )


def scrape_request_to_params(req: ScrapeRequest) -> dict[str, Any]:
    country = req.location.country
    queries = None
    if req.queries:
        # Requêtes du plan IA : déjà « métier + zone », on n'ajoute que le pays.
        queries = [build_maps_query(q, None, country) for q in req.queries if q.strip()][:8] or None
    query = " | ".join(queries) if queries else build_maps_query(req.keywords, req.location.city, country)
    locale = req.locale or req.language
    return {
        "query": query,
        "queries": queries,
        "target": (req.target or "").strip() or None,
        "ai": req.ai,
        "rate": req.rate,
        "sector_sites": [u.strip() for u in (req.sector_sites or []) if u and u.strip()][:10] or None,
        "limit": req.limit,
        "detailed": req.detailed,
        "locale": locale,
        "country": country,
        "filter_country": req.filter_country and bool(country),
    }


def search_request_to_params(req: SearchRequest) -> dict[str, Any]:
    return {
        "query": req.query,
        "limit": req.max_results,
        "detailed": req.detailed,
        "locale": req.locale,
        "country": req.filter_country,
        "filter_country": bool(req.filter_country),
    }
