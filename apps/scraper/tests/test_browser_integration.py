"""Intégration S-05 / S-06 avec un vrai Chromium, sans réseau.

Un faux proxy HTTP (asyncio) exige une authentification, journalise chaque requête
(URL, user-agent) et sert lui-même les pages : robots.txt, annuaire sectoriel, sites
des membres. On vérifie que :
- le proxy de la mission est appliqué par contexte Playwright, identifiants compris ;
- l'user-agent tourne d'un site à l'autre ;
- robots.txt est lu (via le même proxy, avec l'user-agent déclaré) et respecté ;
- les établissements de l'annuaire passent par la visite de site (emails).
"""
from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager

import pytest

from app.browser import BrowserManager
from app.config import Settings
from app.rate import CURRENT_RATE, ScrapeRate, resolve_rate
from app.robots import CURRENT_ROBOTS_REPORT, RobotsReport
from app.scraper import GoogleMapsScraper

DIRECTORY = """<html><body><h1>Membres</h1><ul>
<li><h3>Alpha Plomberie</h3><a href="http://alpha.test/">Site</a> 02 98 11 22 33</li>
<li><h3>Beta Chauffage</h3><a href="http://beta.test/">Site</a></li>
<li><h3>Gamma Interdit</h3><a href="http://gamma.test/">Site</a></li>
</ul><a rel="next" href="/membres?page=2">Suivant</a></body></html>"""
PAGE2 = """<html><body><ul><li><h3>Delta Sanitaire</h3><a href="mailto:contact@delta.test">contact@delta.test</a>
</li></ul><a rel="next" href="/prive/page3">Suivant</a></body></html>"""

PAGES = {
    "http://annuaire.test/robots.txt": (200, "User-agent: *\nDisallow: /prive/\n"),
    "http://annuaire.test/membres": (200, DIRECTORY),
    "http://annuaire.test/membres?page=2": (200, PAGE2),
    "http://annuaire.test/prive/page3": (200, "<html><body>secret</body></html>"),
    "http://alpha.test/robots.txt": (404, ""),
    "http://alpha.test/": (200, "<html><body>Alpha — écrivez-nous : bonjour@alpha.test</body></html>"),
    "http://beta.test/robots.txt": (200, "User-agent: CRMLeadBot\nAllow: /\n"),
    "http://beta.test/": (200, "<html><body>Beta — devis : devis@beta.test</body></html>"),
    "http://gamma.test/robots.txt": (200, "User-agent: CRMLeadBot\nDisallow: /\n"),
    "http://gamma.test/": (200, "<html><body>gamma@gamma.test</body></html>"),
}
AUTH = "Basic " + base64.b64encode(b"alice:s3cret").decode()


@asynccontextmanager
async def fake_proxy():
    log: list[dict] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await reader.readuntil(b"\r\n\r\n")
        except Exception:  # noqa: BLE001
            writer.close()
            return
        lines = head.decode("latin-1").split("\r\n")
        method, url, _ = (lines[0].split(" ") + ["", ""])[:3]
        headers = {k.lower(): v.strip() for k, _, v in (ln.partition(":") for ln in lines[1:] if ln)}
        if headers.get("proxy-authorization") != AUTH:
            writer.write(b"HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"t\"\r\n"
                         b"Content-Length: 0\r\nConnection: close\r\n\r\n")
        else:
            log.append({"method": method, "url": url, "ua": headers.get("user-agent", "")})
            status, body = PAGES.get(url, (404, ""))
            data = body.encode()
            writer.write(f"HTTP/1.1 {status} X\r\nContent-Type: text/html; charset=utf-8\r\n"
                         f"Content-Length: {len(data)}\r\nConnection: close\r\n\r\n".encode() + data)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        yield f"http://alice:s3cret@127.0.0.1:{port}", log
    finally:
        server.close()
        await server.wait_closed()


def test_sector_crawl_through_mission_proxy_with_robots_and_ua_rotation():
    settings = Settings(
        email_page_wait_ms=50, robots_timeout_ms=3000, homepage_enrichment=False,
        claude_skills_enabled=False, sector_max_pages=3, email_concurrency=1, proxy=None,
    )

    async def go():
        manager = BrowserManager(settings)
        try:
            await manager.ensure_started()
        except Exception as exc:  # noqa: BLE001
            pytest.skip(f"Chromium indisponible : {exc}")
        try:
            async with fake_proxy() as (proxy_url, log):
                rate = resolve_rate(ScrapeRate(delayMs=50, rotateUserAgent=True, proxyUrl=proxy_url), settings)
                report = RobotsReport()
                t1, t2 = CURRENT_RATE.set(rate), CURRENT_ROBOTS_REPORT.set(report)
                try:
                    scraper = GoogleMapsScraper(manager, settings)
                    places = await scraper.collect_sector_sites(["http://annuaire.test/membres"], 20, None, rate)
                    ctx, page = await manager.new_page(proxy=rate.proxy, user_agent=rate.user_agent())
                    try:
                        enriched = await scraper._enrich_emails(page, places, True, None, rate, None)
                    finally:
                        await ctx.close()
                finally:
                    CURRENT_ROBOTS_REPORT.reset(t2)
                    CURRENT_RATE.reset(t1)
                return places, enriched, log, report
        finally:
            await manager.stop()

    places, enriched, log, report = asyncio.run(go())

    assert [p.name for p in places] == ["Alpha Plomberie", "Beta Chauffage", "Gamma Interdit", "Delta Sanitaire"]
    assert all(p.source == "directories" for p in places)
    result = {p.name: (p.email, p.email_status) for p in enriched}
    assert result["Alpha Plomberie"] == ("bonjour@alpha.test", "found")
    assert result["Beta Chauffage"] == ("devis@beta.test", "found")
    assert result["Gamma Interdit"] == (None, "robots_disallowed")  # site jamais visité
    assert result["Delta Sanitaire"] == ("contact@delta.test", "found")  # email de l'annuaire conservé

    urls = [entry["url"] for entry in log]
    # Toutes les requêtes (pages + robots.txt) passent par le proxy authentifié de la mission.
    assert "http://annuaire.test/robots.txt" in urls and "http://annuaire.test/membres?page=2" in urls
    assert "http://annuaire.test/prive/page3" not in urls  # interdit par robots.txt
    assert not any(u.startswith("http://gamma.test/") and not u.endswith("robots.txt") for u in urls)
    # robots.txt demandé avec l'user-agent déclaré ; pages avec des user-agents de navigateur tournants.
    assert all(e["ua"].startswith("CRMLeadBot/") for e in log if e["url"].endswith("/robots.txt"))
    site_uas = {e["ua"] for e in log if not e["url"].endswith("/robots.txt")}
    assert all(ua.startswith("Mozilla/5.0") for ua in site_uas)
    assert "http://annuaire.test/prive/page3" in report.disallowed and "http://gamma.test" in report.disallowed
