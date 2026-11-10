"""Extraction d'emails depuis les sites web des leads."""

from __future__ import annotations

import re
from enum import StrEnum
from urllib.parse import urljoin, urlparse

from playwright.async_api import Page, TimeoutError as PWTimeout

from app.contacts import extract_legal, extract_phones, extract_socials, find_contact_url, merge_contacts
from app.homepage import extract_homepage_data, extract_page_text, homepage_has_content
from app.log import get_logger
from app.claude_skills import LeadAnalyzer
from app.rate import CURRENT_RATE
from app.robots import RobotsGuard
from app.schemas import Place

logger = get_logger("email")

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}",
)

# Texte ou URL typique des pages « mentions légales » (FR/EN).
_LEGAL_TEXT_RE = re.compile(
    r"mentions?\s*l[eé]gales?|legal\s*notice|impressum|"
    r"politique\s+de\s+confidentialit|privacy\s+policy|"
    r"donn[eé]es\s+personnelles|contact\s+pro|nous\s+contacter",
    re.I,
)
_LEGAL_HREF_RE = re.compile(
    r"mentions?[-_]?legales?|legal[-_]?notice|impressum|"
    r"privacy|confidentialit|cgv|cgu|contact",
    re.I,
)

# Faux positifs fréquents (assets, placeholders, tracking).
_JUNK_EMAIL_RE = re.compile(
    r"@(example\.(com|org)|domain\.com|email\.com|yoursite\.com|"
    r"sentry\.io|wixpress\.com|schema\.org|googleusercontent\.com|"
    r"2x\.|\.png|\.jpg|\.svg|\.gif|\.webp)",
    re.I,
)

_NOREPLY_RE = re.compile(r"noreply|no-reply|donotreply|mailer-daemon", re.I)

# Adresses de conformité ou techniques : jamais un contact de prospection (le DPO traite les
# demandes RGPD, pas les offres commerciales). Exclues, même si c'est la seule trouvée.
_EXCLUDED_LOCAL_RE = re.compile(
    r"^(dpo|rgpd|gdpr|privacy|cnil|donnees[-._]?personnelles|data[-._]?protection|abuse|postmaster|hostmaster|"
    r"unsubscribe|desinscription|bounce)[-._@]",
    re.I,
)
# Adresses peu adaptées à une approche commerciale : gardées seulement à défaut de mieux.
_LOW_VALUE_LOCAL_RE = re.compile(
    r"^(compta|comptabilite|facturation|factures?|billing|invoice|recrutement|jobs?|careers?|rh|hr|candidature|"
    r"webmaster|admin|support|sav|legal|juridique)[-._@]",
    re.I,
)

# « Emails » qui sont en fait des noms de fichiers (ex. photo@1280x853.jpg, logo@2x.png).
_FILE_EXT_RE = re.compile(r"\.(jpe?g|png|gif|svg|webp|avif|ico|css|js|pdf|mp4)$", re.I)

# Prestataires techniques (hébergeur, CDN, constructeur de sites) : jamais un contact du prospect.
_PROVIDER_RE = re.compile(
    r"@(cloudflare\.com|la-boite-immo\.com|netlify\.com|vercel\.app|squarespace\.com|"
    r"jimdo\.com|webflow\.io|godaddy\.com|ovh\.net|hostinger\.com|ionos\.fr)$",
    re.I,
)


class EmailStatus(StrEnum):
    FOUND = "found"
    FOUND_LEGAL = "found_legal"
    NO_EMAIL = "no_email"
    NO_WEBSITE = "no_website"
    UNREACHABLE = "unreachable"
    SKIPPED = "skipped"
    ROBOTS_DISALLOWED = "robots_disallowed"


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme:
        return f"https://{url.strip()}"
    return url.strip()


def _site_domain(url: str | None) -> str | None:
    if not url:
        return None
    host = urlparse(_normalize_url(url)).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None


def _extract_from_text(text: str) -> set[str]:
    found: set[str] = set()
    for match in _EMAIL_RE.findall(text):
        email = match.lower()
        if _is_junk(email):
            continue
        found.add(email)
    return found


def _is_junk(email: str) -> bool:
    return bool(
        _JUNK_EMAIL_RE.search(email)
        or _FILE_EXT_RE.search(email)
        or _PROVIDER_RE.search(email)
        or _EXCLUDED_LOCAL_RE.search(email)
        or _NOREPLY_RE.search(email)
    )


def _pick_best(emails: set[str], website: str | None) -> str | None:
    """Email de prospection le plus pertinent : domaine du site d'abord, adresses « métier »
    (compta, recrutement, webmaster…) seulement à défaut. Ne renvoie jamais une adresse exclue."""
    usable = sorted(e for e in emails if not _is_junk(e))
    if not usable:
        return None
    domain = _site_domain(website)

    def rank(e: str) -> tuple[int, int, str]:
        on_domain = 0 if domain and e.endswith(f"@{domain}") else 1
        low_value = 1 if _LOW_VALUE_LOCAL_RE.search(e) else 0
        return (low_value, on_domain, e)

    return min(usable, key=rank)


class EmailExtractor:
    """Visite le site d'un lead et tente de trouver une adresse email."""

    def __init__(
        self,
        nav_timeout_ms: int = 15000,
        page_wait_ms: int = 2000,
        *,
        homepage_enrichment: bool = True,
        analyzer: LeadAnalyzer | None = None,
        robots: RobotsGuard | None = None,
    ) -> None:
        self._nav_timeout = nav_timeout_ms
        self._page_wait = page_wait_ms
        self._homepage_enrichment = homepage_enrichment
        self._analyzer = analyzer
        self._robots = robots

    def _without_site(self, place: Place, status: EmailStatus) -> Place:
        # Un email déjà connu (lu sur un site sectoriel) est conservé.
        return place.model_copy(
            update={
                "email": place.email,
                "email_status": EmailStatus.FOUND if place.email else status,
                "enrichment": None,
            }
        )

    def _unreachable(self, place: Place) -> Place:
        return self._without_site(place, EmailStatus.UNREACHABLE)

    def _no_website(self, place: Place) -> Place:
        return self._without_site(place, EmailStatus.NO_WEBSITE)

    async def _robots_ok(self, url: str) -> bool:
        return self._robots is None or await self._robots.allowed(url)

    async def _goto(self, page: Page, url: str, *, robots_checked: bool = False) -> bool:
        """Navigation (robots.txt vérifié sauf si déjà fait). False si interdit ou en échec."""
        if not robots_checked and not await self._robots_ok(url):
            return False
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=self._nav_timeout)
            await page.wait_for_timeout(self._page_wait)
            return True
        except PWTimeout:
            return False
        except Exception:  # noqa: BLE001
            return False

    async def enrich(self, page: Page, place: Place, target: str | None = None) -> Place:
        """Visite le site : emails (accueil puis mentions légales/contact) et analyse IA.

        Sans IA, l'email est choisi par heuristique (domaine du site, pas de noreply).
        Avec IA (skill crm-lead-analysis), Claude choisit le meilleur email parmi les
        candidats, identifie le décideur et note l'adéquation à la cible.
        """
        if not place.website:
            # Sans site, la fiche Maps seule permet encore de juger l'adéquation (ex. une
            # franchise reconnaissable à son nom quand la cible les exclut).
            if self._analyzer is not None and self._homepage_enrichment and target:
                return await self._analyze_card_only(place, target)
            return self._no_website(place)

        url = _normalize_url(place.website)
        logger.debug("Visite %s", url)
        if not await self._robots_ok(url):
            # robots.txt interdit la page d'accueil : aucune visite du site.
            # Statut tracé même si un email est déjà connu (site sectoriel), qui est conservé.
            return self._without_site(place, EmailStatus.ROBOTS_DISALLOWED).model_copy(
                update={"email_status": EmailStatus.ROBOTS_DISALLOWED}
            )
        if not await self._goto(page, url, robots_checked=True):
            return self._unreachable(place)

        analyze = self._analyzer is not None and self._homepage_enrichment
        homepage = await extract_homepage_data(page) if analyze else None
        if homepage is not None and not homepage_has_content(homepage):
            homepage = None

        home_emails = await self._collect_emails(page)
        home_contacts = await self._page_contacts(page, url, "accueil", legal=False)
        legal_emails: set[str] = set()
        legal_page: dict | None = None
        legal_contacts: dict | None = None
        legal_url: str | None = None

        # La page légale est visitée si aucun email n'est trouvé, ou pour l'analyse IA
        # (c'est là que figurent le gérant / directeur de la publication, SIREN, forme juridique).
        if not _pick_best(home_emails, url) or analyze:
            legal_url = await self._find_legal_link(page, url)
            rate = CURRENT_RATE.get()
            if legal_url and rate is not None:
                await rate.pause()
            if legal_url and await self._goto(page, legal_url):
                logger.debug("Page légale : %s", legal_url)
                legal_emails = await self._collect_emails(page)
                legal_contacts = await self._page_contacts(page, url, "mentions", legal=True)
                if analyze:
                    legal_page = await extract_page_text(page)

        # Page contact : visitée seulement s'il manque encore un moyen de joindre l'établissement.
        contact_url = (home_contacts or {}).get("contact_url")
        contact_emails: set[str] = set()
        contact_contacts: dict | None = None
        no_phone = not ((home_contacts or {}).get("phones") or (legal_contacts or {}).get("phones"))
        if contact_url and contact_url != legal_url and (no_phone or not (home_emails | legal_emails)):
            rate = CURRENT_RATE.get()
            if rate is not None:
                await rate.pause()
            if await self._goto(page, contact_url):
                contact_emails = await self._collect_emails(page)
                contact_contacts = await self._page_contacts(page, url, "contact", legal=False)

        contacts = merge_contacts(home_contacts, legal_contacts, contact_contacts)
        phones = (contacts or {}).get("phones") or []
        # Email lu sur un site sectoriel : candidat au même titre que ceux du site.
        known = {place.email.lower()} if place.email else set()
        candidates = home_emails | legal_emails | contact_emails | known
        email = (
            _pick_best(home_emails, url)
            or _pick_best(legal_emails | contact_emails, url)
            or _pick_best(known, url)
        )
        updates: dict = {"enrichment": None, "contacts": contacts}

        if analyze and (homepage or legal_page):
            ai = await self._analyzer.analyze(
                target=target,
                place=place.model_dump(),
                homepage=homepage,
                legal_page=legal_page,
                emails=sorted(candidates),
                phones=[p["display"] for p in phones],
            )
            if ai:
                # L'IA a vu tous les candidats : son choix fait foi, y compris « aucun »
                # (évite de retomber sur l'email d'un prestataire ou d'une autre société).
                email = ai.get("best_email") or None
                dm = ai.get("decision_maker") or None
                if dm and dm.get("first_name") and dm.get("last_name"):
                    updates["contact_name"] = f"{dm['first_name']} {dm['last_name']}".strip()
                    updates["contact_role"] = dm.get("role") or None
                updates["enrichment"] = ai.get("summary") or None
                updates["ai"] = {
                    "summary": ai.get("summary"),
                    "activity": ai.get("activity") or None,
                    "services": ai.get("services") or [],
                    "signals": ai.get("signals") or [],
                    "fit_score": ai.get("fit_score"),
                    "fit_reason": ai.get("fit_reason") or None,
                    "decision_maker_role": (dm or {}).get("role") or None,
                    "decision_maker_email": (dm or {}).get("email") or None,
                    "decision_maker_phone": (dm or {}).get("phone") or None,
                    "best_phone": ai.get("best_phone") or None,
                }
                logger.info(
                    "Analyse IA — %s : score %s%s",
                    place.name[:50],
                    ai.get("fit_score"),
                    f", décideur {updates['contact_name']}" if updates.get("contact_name") else "",
                )

        # Sans téléphone sur la fiche Maps, on retient celui du site (choix IA, sinon le premier fixe).
        if not place.phone and phones:
            chosen = (updates.get("ai") or {}).get("best_phone")
            fixe = next((p["display"] for p in phones if p["kind"] == "fixe"), None)
            updates["phone"] = chosen or fixe or phones[0]["display"]

        if not email:
            status = EmailStatus.NO_EMAIL
        elif email in home_emails or email not in (legal_emails | contact_emails):
            status = EmailStatus.FOUND
        else:
            status = EmailStatus.FOUND_LEGAL
        return place.model_copy(update={"email": email, "email_status": status, **updates})

    async def _page_contacts(self, page: Page, site_url: str, source: str, *, legal: bool) -> dict | None:
        """Téléphones, réseaux sociaux, page contact (et infos légales) de la page courante."""
        try:
            links = await page.eval_on_selector_all(
                "a[href]",
                "els => els.map(a => ({ href: a.href || '', text: (a.innerText || a.textContent || '').trim().slice(0, 80) }))",
            )
        except Exception:  # noqa: BLE001
            links = []
        try:
            text = await page.inner_text("body")
        except Exception:  # noqa: BLE001
            text = ""
        hrefs = [l.get("href") or "" for l in links]
        return merge_contacts(
            {
                "phones": extract_phones(text, [h for h in hrefs if h.startswith("tel:")], source=source),
                "socials": extract_socials([h for h in hrefs if h.startswith("http")]),
                "contact_url": find_contact_url(links, site_url),
                "legal": extract_legal(text) if legal else None,
            }
        )

    async def _analyze_card_only(self, place: Place, target: str) -> Place:
        base = self._no_website(place)
        ai = await self._analyzer.analyze(target=target, place=place.model_dump(), homepage=None, legal_page=None, emails=[])
        if not ai:
            return base
        logger.info("Analyse IA (fiche Maps seule) — %s : score %s", place.name[:50], ai.get("fit_score"))
        return base.model_copy(
            update={
                "enrichment": ai.get("summary") or None,
                "ai": {
                    "summary": ai.get("summary"),
                    "activity": ai.get("activity") or None,
                    "services": ai.get("services") or [],
                    "signals": ai.get("signals") or [],
                    "fit_score": ai.get("fit_score"),
                    "fit_reason": ai.get("fit_reason") or None,
                    "decision_maker_role": None,
                },
            }
        )

    async def _collect_emails(self, page: Page) -> set[str]:
        emails: set[str] = set()

        try:
            body_text = await page.inner_text("body")
            emails |= _extract_from_text(body_text)
        except Exception:  # noqa: BLE001
            pass

        try:
            html = await page.content()
            emails |= _extract_from_text(html)
        except Exception:  # noqa: BLE001
            pass

        try:
            mailtos = await page.eval_on_selector_all(
                'a[href^="mailto:"]',
                "els => els.map(a => a.getAttribute('href') || '')",
            )
            for href in mailtos:
                addr = href.split("mailto:", 1)[-1].split("?")[0].strip()
                if addr and "@" in addr and not _is_junk(addr.lower()):
                    emails.add(addr.lower())
        except Exception:  # noqa: BLE001
            pass

        return emails

    async def _find_legal_link(self, page: Page, base_url: str) -> str | None:
        try:
            links = await page.eval_on_selector_all(
                "a[href]",
                """els => els.map(a => ({
                    href: a.href,
                    text: (a.innerText || a.textContent || '').trim()
                }))""",
            )
        except Exception:  # noqa: BLE001
            return None

        candidates: list[tuple[int, str]] = []
        for link in links:
            href = (link.get("href") or "").strip()
            text = link.get("text") or ""
            if not href or href.startswith(("javascript:", "mailto:", "#")):
                continue
            score = 0
            if _LEGAL_TEXT_RE.search(text):
                score += 2
            if _LEGAL_HREF_RE.search(href):
                score += 1
            if score > 0:
                absolute = urljoin(base_url, href)
                if urlparse(absolute).scheme in ("http", "https"):
                    candidates.append((score, absolute))

        if not candidates:
            return None
        candidates.sort(key=lambda x: (-x[0], x[1]))
        return candidates[0][1]
