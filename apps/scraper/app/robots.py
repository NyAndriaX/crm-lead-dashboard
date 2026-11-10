"""Respect de robots.txt (S-05) pour toutes les visites de sites du scraper.

- Un robots.txt par origine (schéma + hôte + port), mis en cache ``robots_cache_ttl_s``.
- Récupéré avec l'user-agent déclaré du robot (``ROBOTS_USER_AGENT``) et le proxy de la mission.
- Règles interprétées par ``urllib.robotparser`` pour le jeton du robot (section ``*`` à défaut).
- Codes HTTP (RFC 9309) : 2xx → règles du fichier ; 4xx → tout est autorisé (pas de
  robots.txt) ; 5xx, erreur réseau ou délai dépassé → tout est interdit.
- Chaque page refusée est journalisée et ajoutée au rapport de la mission (``ScrapeMeta.robots``).

La collecte Google Maps elle-même n'est pas soumise à ce contrôle : c'est la source de
données du service (endpoint interne de la SPA Maps), voir docs/ENV.md.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.log import get_logger
from app.rate import CURRENT_RATE, httpx_proxy_url

logger = get_logger("robots")

# (status HTTP, contenu) — 0 = erreur réseau / délai dépassé.
Fetcher = Callable[[str, str | None], Awaitable[tuple[int, str]]]


@dataclass
class RobotsReport:
    """Bilan robots.txt d'une mission (renvoyé au CRM dans ScrapeMeta.robots)."""

    checked_domains: set[str] = field(default_factory=set)
    allowed: int = 0
    disallowed: list[str] = field(default_factory=list)

    def as_meta(self) -> dict:
        return {
            "enforced": True,
            "domains_checked": len(self.checked_domains),
            "pages_allowed": self.allowed,
            "pages_disallowed": len(self.disallowed),
            "disallowed_urls": self.disallowed[:50],
        }


CURRENT_ROBOTS_REPORT: ContextVar[RobotsReport | None] = ContextVar("robots_report", default=None)


@dataclass
class _Entry:
    parser: RobotFileParser
    fetched_at: float
    status: int


def _origin(url: str) -> str | None:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    return f"{p.scheme}://{p.netloc.lower()}"


async def _httpx_fetch(url: str, proxy: str | None, *, user_agent: str, timeout_s: float) -> tuple[int, str]:
    try:
        async with httpx.AsyncClient(
            proxy=proxy,
            timeout=timeout_s,
            follow_redirects=True,
            headers={"User-Agent": user_agent},
            verify=False,  # noqa: S501 — robots.txt public ; certains petits sites ont un certificat expiré
        ) as client:
            resp = await client.get(url)
            text = resp.text if resp.status_code < 300 else ""
            return resp.status_code, text[:500_000]
    except Exception as exc:  # noqa: BLE001
        logger.debug("robots.txt %s — erreur réseau : %r", url, exc)
        return 0, ""


class RobotsGuard:
    """Contrôle d'accès robots.txt partagé par toutes les missions (cache par domaine)."""

    def __init__(
        self,
        *,
        user_agent: str,
        enabled: bool = True,
        cache_ttl_s: int = 3600,
        timeout_ms: int = 8000,
        fetcher: Fetcher | None = None,
    ) -> None:
        self.user_agent = user_agent
        # Jeton comparé aux sections « User-agent: » (ex. CRMLeadBot).
        self.token = user_agent.split("/")[0].strip() or "*"
        self.enabled = enabled
        self._ttl = cache_ttl_s
        self._timeout_s = max(1.0, timeout_ms / 1000)
        self._fetcher = fetcher
        self._cache: dict[str, _Entry] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def _fetch(self, robots_url: str) -> tuple[int, str]:
        rate = CURRENT_RATE.get()
        proxy = httpx_proxy_url(rate.proxy) if rate else None
        if self._fetcher is not None:
            return await self._fetcher(robots_url, proxy)
        return await _httpx_fetch(robots_url, proxy, user_agent=self.user_agent, timeout_s=self._timeout_s)

    async def _parser_for(self, origin: str) -> _Entry:
        cached = self._cache.get(origin)
        if cached and time.monotonic() - cached.fetched_at < self._ttl:
            return cached
        lock = self._locks.setdefault(origin, asyncio.Lock())
        async with lock:
            cached = self._cache.get(origin)
            if cached and time.monotonic() - cached.fetched_at < self._ttl:
                return cached
            robots_url = f"{origin}/robots.txt"
            status, text = await self._fetch(robots_url)
            parser = RobotFileParser(robots_url)
            if 200 <= status < 300:
                parser.parse(text.splitlines())
            elif 400 <= status < 500:
                parser.allow_all = True
            else:
                # 5xx / injoignable : RFC 9309 §2.3.1.4 — on suppose tout interdit.
                parser.disallow_all = True
            parser.modified()
            entry = _Entry(parser=parser, fetched_at=time.monotonic(), status=status)
            self._cache[origin] = entry
            logger.info(
                "robots.txt %s — HTTP %s%s",
                origin,
                status or "injoignable",
                " (tout interdit)" if parser.disallow_all else " (tout autorisé)" if parser.allow_all else "",
            )
            return entry

    async def allowed(self, url: str) -> bool:
        """True si l'URL peut être visitée. Les refus sont journalisés et tracés dans le rapport."""
        if not self.enabled:
            return True
        origin = _origin(url)
        if origin is None:
            return True
        entry = await self._parser_for(origin)
        ok = entry.parser.can_fetch(self.token, url)
        report = CURRENT_ROBOTS_REPORT.get()
        if report is not None:
            report.checked_domains.add(origin)
            if ok:
                report.allowed += 1
            elif url not in report.disallowed:
                report.disallowed.append(url)
        if not ok:
            logger.info("robots.txt — page ignorée (interdite pour %s) : %s", self.token, url)
        return ok

    async def crawl_delay_s(self, url: str) -> float | None:
        """Crawl-delay déclaré pour le robot (None si absent)."""
        origin = _origin(url)
        if not self.enabled or origin is None:
            return None
        entry = await self._parser_for(origin)
        delay = entry.parser.crawl_delay(self.token)
        return float(delay) if delay is not None else None
