"""Scraping Google Maps.

Strategie : Chromium (Playwright + playwright-stealth) sert a franchir la
page de consentement Google et a etablir une session/cookies valides. La
SPA Google Maps ne s'hydrate pas de maniere fiable en environnement headless
(Google sert une coquille statique aux navigateurs automatises) ; on
interroge donc le meme endpoint de donnees interne que la SPA utiliserait
(`/search?tbm=map&...&pb=...`), via le contexte authentifie de la page, puis
on parse la reponse.
"""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import quote_plus

from playwright.async_api import Page, TimeoutError as PWTimeout

from app.browser import BrowserManager
from app.config import Settings
from app.directory import extract_directory_entries, find_next_page
from app.email_extractor import EmailExtractor, EmailStatus
from app.claude_skills import LeadAnalyzer
from app.log import get_logger, log_step
from app.normalizer import website_domain
from app.rate import RateSettings
from app.robots import RobotsGuard
from app.schemas import Place

logger = get_logger("maps")

# Boutons "tout accepter" du consentement Google (FR/EN).
_CONSENT_RE = re.compile(r"Tout accepter|Accepter tout|Accept all|I agree", re.I)

# Lien vers l'endpoint de donnees, embarque dans le HTML rendu cote serveur.
_PB_HREF_RE = re.compile(r'href="(/search\?tbm=map[^"]*?pb=[^"]*)"')

# Place ID "ChIJ..." present dans les liens internes de chaque fiche.
_PLACEID_RE = re.compile(r"placeid=(ChIJ[\w-]+)")

# Taille de page renvoyee par l'endpoint (Google ignore au-dela de ~20).
_PAGE_SIZE = 20


def _get(obj, *path):
    """Acces defensif a une structure imbriquee : retourne None si absent."""
    for key in path:
        try:
            obj = obj[key]
        except (IndexError, KeyError, TypeError):
            return None
    return obj


class GoogleMapsScraper:
    def __init__(self, browser: BrowserManager, settings: Settings) -> None:
        self._browser = browser
        self._settings = settings
        analyzer = None
        if settings.homepage_enrichment:
            # Toujours prêt : le fournisseur peut venir du CRM (mission) même si l'IA du serveur est éteinte.
            analyzer = LeadAnalyzer(
                model=settings.claude_model,
                timeout_ms=settings.claude_timeout_ms,
                claude_bin=settings.claude_bin,
                max_concurrency=settings.claude_max_concurrency,
                env_enabled=settings.claude_skills_enabled,
            )
        # robots.txt : un seul garde (cache par domaine) pour toutes les missions.
        self._robots = RobotsGuard(
            user_agent=settings.robots_user_agent,
            enabled=settings.robots_txt_enforce,
            cache_ttl_s=settings.robots_cache_ttl_s,
            timeout_ms=settings.robots_timeout_ms,
        )
        self._email_extractor = EmailExtractor(
            nav_timeout_ms=settings.email_nav_timeout_ms,
            page_wait_ms=settings.email_page_wait_ms,
            homepage_enrichment=settings.homepage_enrichment,
            analyzer=analyzer,
            robots=self._robots,
        )
        self._email_concurrency = max(1, settings.email_concurrency)

    async def search(
        self,
        query: str | list[str],
        max_results: int,
        detailed: bool,
        locale: str | None,
        target: str | None = None,
        rate: RateSettings | None = None,
        sector_sites: list[str] | None = None,
    ) -> list[Place]:
        """Une ou plusieurs requêtes Maps → fiches dédoublonnées (≤ max_results) → visite des sites.

        Avec plusieurs requêtes (plan IA), chaque requête complète la collecte jusqu'à
        `max_results` fiches uniques ; les sites ne sont visités qu'une fois, à la fin.
        Les établissements des sites sectoriels (`sector_sites`, ≤ max_results) rejoignent
        ensuite les fiches Maps et suivent le même traitement (visite, analyse IA).
        `rate` : proxy, user-agent et délai de la mission (sinon configuration globale).
        """
        rate = rate or RateSettings()
        queries = [q for q in ([query] if isinstance(query, str) else query) if q.strip()]
        lang = (locale or "fr").split("-")[0]
        logger.info(
            "Recherche Maps — %s requête(s) max=%s detailed=%s locale=%s",
            len(queries),
            max_results,
            detailed,
            locale or self._settings.locale,
        )
        context, page = await self._browser.new_page(
            locale=locale, proxy=rate.proxy, user_agent=rate.user_agent()
        )
        logger.info("Débit — %s", rate.describe())
        try:
            seen: set[str] = set()
            places: list[Place] = []
            for i, q in enumerate(queries, start=1):
                if len(places) >= max_results:
                    break
                remaining = max_results - len(places)
                logger.info("[requête %s/%s] %r — objectif +%s fiche(s)", i, len(queries), q, remaining)
                if i > 1:
                    await rate.pause()
                found = await self._collect(page, q, remaining, lang, seen, rate)
                places.extend(found)
                logger.info("[requête %s/%s] +%s nouvelle(s), total=%s", i, len(queries), len(found), len(places))

            places = places[:max_results]
            if sector_sites:
                sector = await self.collect_sector_sites(sector_sites, max_results, locale, rate)
                known = {d for d in (website_domain(p.website) for p in places) if d}
                added = 0
                for sp in sector:
                    d = website_domain(sp.website)
                    if d and d in known:
                        continue  # déjà trouvé sur Google Maps
                    if d:
                        known.add(d)
                    places.append(sp)
                    added += 1
                logger.info("Sites sectoriels — %s établissement(s) ajouté(s) au pipeline", added)
            logger.info("%s fiche(s) — début extraction emails / analyse", len(places))
            return await self._enrich_emails(page, places, detailed, target, rate, locale)
        finally:
            await context.close()

    async def collect_sector_sites(
        self,
        urls: list[str],
        max_results: int,
        locale: str | None,
        rate: RateSettings,
    ) -> list[Place]:
        """Visite les pages sectorielles (robots.txt respecté) et en extrait les établissements."""
        context, page = await self._browser.new_page(
            locale=locale, proxy=rate.proxy, user_agent=rate.user_agent()
        )
        out: list[Place] = []
        try:
            for start in urls:
                url: str | None = start.strip()
                pages = 0
                while url and pages < max(1, self._settings.sector_max_pages) and len(out) < max_results:
                    if not url.startswith(("http://", "https://")):
                        logger.warning("Site sectoriel ignoré (URL invalide) : %s", url)
                        break
                    if not await self._robots.allowed(url):
                        logger.info("Site sectoriel — page interdite par robots.txt : %s", url)
                        break
                    if pages > 0:
                        crawl_delay = await self._robots.crawl_delay_s(url)
                        await asyncio.sleep(max(rate.delay_ms / 1000, min(crawl_delay or 0, 30)))
                    pages += 1
                    try:
                        await page.goto(url, wait_until="domcontentloaded", timeout=self._settings.nav_timeout_ms)
                        await page.wait_for_timeout(self._settings.email_page_wait_ms)
                        html = await page.content()
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Site sectoriel injoignable %s : %s", url, exc)
                        break
                    entries = extract_directory_entries(html, page.url)
                    for e in entries:
                        if len(out) >= max_results:
                            break
                        out.append(
                            Place(
                                name=e.name,
                                website=e.website,
                                email=e.email,
                                phone=e.phone,
                                address=e.address,
                                source="directories",
                                source_url=e.source_url,
                            )
                        )
                    logger.info("Site sectoriel %s — %s établissement(s) lu(s)", url, len(entries))
                    nxt = find_next_page(html, page.url)
                    url = nxt if nxt and nxt != url else None
        finally:
            await context.close()
        return out

    async def _collect(
        self,
        page: Page,
        query: str,
        max_results: int,
        lang: str,
        seen: set[str],
        rate: RateSettings | None = None,
    ) -> list[Place]:
        """Fiches d'une requête Maps (pagination), en ignorant celles déjà vues."""
        url = f"https://www.google.com/maps/search/{quote_plus(query)}?hl={lang}"
        with log_step(logger, "Navigation Google Maps"):
            await self._goto_with_retry(page, url)
            logger.info("URL courante : %s", page.url)
            await self._dismiss_consent(page)
            if "consent." in page.url:
                logger.warning("Consentement Google non résolu — %s", page.url)

        with log_step(logger, "Extraction endpoint pb"):
            base_href = await self._extract_pb_href(page)
            logger.info("Endpoint pb trouvé (pagination=%s)", "8i" in base_href)

        places: list[Place] = []
        for offset in range(0, max_results + _PAGE_SIZE, _PAGE_SIZE):
            logger.info("Pagination Maps — offset=%s", offset)
            if offset > 0 and rate is not None:
                await rate.pause()
            payload = await self._fetch_payload(page, self._with_offset(base_href, offset))
            if payload is None:
                logger.warning("Pagination offset=%s — réponse vide ou erreur", offset)
                break

            page_places = self._parse(payload)
            if not page_places:
                logger.info("Pagination offset=%s — 0 fiche parsée, fin", offset)
                break

            new = 0
            for pl in page_places:
                key = pl.place_id or f"{pl.name}|{pl.latitude}"
                if key in seen:
                    continue
                seen.add(key)
                places.append(pl)
                new += 1
                if len(places) >= max_results:
                    return places

            if new == 0 or "8i" not in base_href:
                break
        return places

    async def _enrich_emails(
        self,
        page: Page,
        places: list[Place],
        detailed: bool,
        target: str | None = None,
        rate: RateSettings | None = None,
        locale: str | None = None,
    ) -> list[Place]:
        rate = rate or RateSettings()
        if not detailed:
            logger.info("Emails et enrichissement ignorés (detailed=false)")
            return [
                pl.model_copy(
                    update={
                        "email": pl.email,
                        "email_status": EmailStatus.FOUND if pl.email else EmailStatus.SKIPPED,
                        "enrichment": None,
                    }
                )
                for pl in places
            ]

        total = len(places)
        logger.info(
            "Extraction emails — %s site(s), concurrence=%s",
            total,
            self._email_concurrency,
        )
        context = page.context
        sem = asyncio.Semaphore(self._email_concurrency)

        async def _enrich_one(index: int, pl: Place) -> Place:
            label = (pl.name or "?")[:60]
            site = pl.website or "(pas de site)"
            async with sem:
                if index > 1 and pl.website:
                    await rate.pause()  # délai entre deux fiches (par file de visite)
                logger.info("[%s/%s] Email — %s — %s", index, total, label, site)
                own_context = None
                if rate.rotate_user_agent and pl.website:
                    # Rotation : chaque site est visité dans un contexte neuf (nouvel user-agent).
                    own_context, sub = await self._browser.new_page(
                        locale=locale, proxy=rate.proxy, user_agent=rate.user_agent()
                    )
                else:
                    sub = await context.new_page()
                    sub.set_default_timeout(self._settings.nav_timeout_ms)
                try:
                    result = await self._email_extractor.enrich(sub, pl, target)
                finally:
                    await sub.close()
                    if own_context is not None:
                        await own_context.close()
            status = result.email_status or "?"
            email_hint = result.email or "—"
            enrichment_hint = (
                (result.enrichment or "")[:80] + "…"
                if result.enrichment and len(result.enrichment) > 80
                else (result.enrichment or "—")
            )
            logger.info(
                "[%s/%s] Email — %s → %s (%s) | enrichment=%s",
                index,
                total,
                label,
                status,
                email_hint,
                enrichment_hint,
            )
            return result

        return list(
            await asyncio.gather(
                *[_enrich_one(i + 1, pl) for i, pl in enumerate(places)]
            )
        )

    async def _goto_with_retry(self, page: Page, url: str, tries: int = 3) -> None:
        last: Exception | None = None
        for attempt in range(1, tries + 1):
            try:
                logger.debug("goto tentative %s/%s — %s", attempt, tries, url[:80])
                await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=self._settings.nav_timeout_ms,
                )
                await page.wait_for_timeout(2000)
                return
            except Exception as exc:  # noqa: BLE001 - reessaie (ex: ERR_CERT_*)
                last = exc
                logger.warning("goto tentative %s échouée : %s", attempt, exc)
                await page.wait_for_timeout(1500)
        raise RuntimeError(f"Navigation echouee: {last}")

    async def _dismiss_consent(self, page: Page) -> None:
        if "consent." not in page.url:
            return
        logger.info("Consentement Google — acceptation en cours")
        try:
            btn = page.get_by_role("button", name=_CONSENT_RE).first
            if await btn.count():
                await btn.click()
            else:
                # Repli : soumettre le formulaire de consentement.
                await page.locator(
                    'form[action*="consent"] button'
                ).first.click()
            await page.wait_for_url(
                re.compile(r"google\.com/maps"), timeout=20000
            )
            await page.wait_for_timeout(1500)
        except PWTimeout:
            logger.warning("Consentement Google — timeout, on continue")

    async def _extract_pb_href(self, page: Page) -> str:
        html = await page.content()
        match = _PB_HREF_RE.search(html)
        if not match:
            raise RuntimeError(
                "Endpoint de donnees Google Maps introuvable "
                "(structure de page modifiee ou requete bloquee)"
            )
        return match.group(1).replace("&amp;", "&")

    @staticmethod
    def _with_offset(href: str, offset: int) -> str:
        """Ajuste l'offset de pagination (`8i<n>`) si present dans le pb."""
        if offset == 0 or "8i" not in href:
            return href
        return re.sub(r"8i\d+", f"8i{offset}", href, count=1)

    async def _fetch_payload(self, page: Page, href: str):
        try:
            resp = await page.request.get(
                "https://www.google.com" + href,
                timeout=self._settings.nav_timeout_ms,
            )
            if resp.status != 200:
                logger.warning("API Maps HTTP %s", resp.status)
                return None
            body = await resp.text()
        except Exception as exc:  # noqa: BLE001
            logger.warning("API Maps — erreur réseau : %s", exc)
            return None
        if body.startswith(")]}'"):
            body = body[body.find("\n") + 1 :]
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None

    def _parse(self, data) -> list[Place]:
        entries = _get(data, 64)
        if not isinstance(entries, list):
            return []

        places: list[Place] = []
        for entry in entries:
            rec = _get(entry, 1)
            name = _get(rec, 11)
            if not isinstance(rec, list) or not name:
                continue

            place_id = None
            m = _PLACEID_RE.search(json.dumps(rec))
            if m:
                place_id = m.group(1)

            maps_url = None
            if place_id:
                maps_url = (
                    "https://www.google.com/maps/place/?q=place_id:"
                    f"{place_id}"
                )

            places.append(
                Place(
                    name=name,
                    rating=_get(rec, 4, 7),
                    reviews=_get(rec, 4, 8),
                    category=_get(rec, 13, 0),
                    address=_get(rec, 18),
                    phone=_get(rec, 178, 0, 0),
                    website=_get(rec, 7, 0),
                    latitude=_get(rec, 9, 2),
                    longitude=_get(rec, 9, 3),
                    place_id=place_id,
                    maps_url=maps_url,
                )
            )
        return places
