"""Données de contact complémentaires lues sur le site d'un établissement.

Téléphones (liens ``tel:`` et numéros affichés), réseaux sociaux, page contact et
informations légales (SIREN/SIRET, forme juridique) des mentions légales.
Fonctions pures : testables sans navigateur.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

# Numéros français : +33 / 0033 / 0 suivi de 9 chiffres, séparateurs usuels.
_FR_PHONE_RE = re.compile(
    r"(?<![\d+])(?:(?:\+|00)33[\s.\-]?(?:\(0\)[\s.\-]?)?|0)([1-9])(?:[\s.\-]?\d{2}){4}(?!\d)"
)
_DIGITS_RE = re.compile(r"\D+")

_SOCIAL_HOSTS: dict[str, tuple[str, ...]] = {
    "linkedin": ("linkedin.com",),
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "x": ("twitter.com", "x.com"),
    "youtube": ("youtube.com", "youtu.be"),
    "tiktok": ("tiktok.com",),
}
# Liens de partage / génériques : pas un profil de l'établissement.
_SOCIAL_NOISE_RE = re.compile(r"/(sharer|share|intent|dialog|plugins|login|home\.php)|/hashtag/", re.I)

_CONTACT_TEXT_RE = re.compile(r"\b(contact|contactez|nous\s+contacter|nous\s+[ée]crire|rendez[-\s]vous)\b", re.I)
_CONTACT_HREF_RE = re.compile(r"contact|rendez-vous|rdv", re.I)

_SIRET_RE = re.compile(r"\bSIRET\s*(?:n[°o]\s*)?:?\s*((?:\d[\s.]?){14})", re.I)
_SIREN_RE = re.compile(r"\b(?:SIREN|RCS[\w\s'’-]{0,40}?|R\.C\.S\.?[\w\s'’-]{0,40}?)\s*(?:n[°o]\s*)?:?\s*((?:\d[\s.]?){9})(?!\s?\d)", re.I)
_LEGAL_FORMS = ("SASU", "SAS", "SARL", "EURL", "SA", "SCI", "SNC", "SCP", "SELARL", "SELAS", "EI", "EIRL", "SCOP")
_LEGAL_FORM_RE = re.compile(r"\b(" + "|".join(_LEGAL_FORMS) + r")\b")
_CAPITAL_RE = re.compile(r"capital\s+(?:social\s+)?(?:de\s+)?([\d\s.,]+)\s*(?:€|euros?)", re.I)


def normalize_fr_phone(raw: str) -> str | None:
    """Numéro français au format E.164 (+33XXXXXXXXX), ou None s'il n'est pas valide."""
    digits = _DIGITS_RE.sub("", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]  # 0033… → 33…
    if digits.startswith("330") and len(digits) == 12:
        digits = digits[2:]  # +33 (0)6… → 06…
    elif digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) != 10 or not digits.startswith("0") or digits[1] == "0":
        return None
    return "+33" + digits[1:]


def phone_kind(e164: str) -> str:
    """mobile (06/07), special (08 : numéros spéciaux) ou fixe."""
    first = e164[3:4]
    if first in ("6", "7"):
        return "mobile"
    if first == "8":
        return "special"
    return "fixe"


def display_fr_phone(e164: str) -> str:
    d = "0" + e164[3:]
    return " ".join(d[i : i + 2] for i in range(0, 10, 2))


def extract_phones(text: str | None, tel_hrefs: list[str] | None = None, source: str = "site") -> list[dict[str, str]]:
    """Téléphones trouvés dans le texte d'une page et ses liens ``tel:`` (dédoublonnés)."""
    found: dict[str, dict[str, str]] = {}

    def add(raw: str, how: str) -> None:
        e164 = normalize_fr_phone(raw)
        if e164 and e164 not in found:
            found[e164] = {"number": e164, "display": display_fr_phone(e164), "kind": phone_kind(e164), "source": f"{source}:{how}"}

    for href in tel_hrefs or []:
        add(href.split("tel:", 1)[-1], "tel")
    for m in _FR_PHONE_RE.finditer(text or ""):
        add(m.group(0), "texte")
    return list(found.values())


# Clé de `socials` qui transporte TOUS les liens LinkedIn du site (entreprise et personnes), séparés par
# un espace : le contrat `LeadContacts.socials` (dict[str, str]) reste inchangé. Lue par le CRM (E-04).
LINKEDIN_LINKS_KEY = "linkedin_links"


def extract_socials(hrefs: list[str]) -> dict[str, str]:
    """Premier profil trouvé par réseau social (liens de partage ignorés) + tous les liens LinkedIn."""
    out: dict[str, str] = {}
    linkedin = extract_linkedin_links(hrefs)
    if linkedin:
        out[LINKEDIN_LINKS_KEY] = " ".join(li["url"] for li in linkedin)
    for href in hrefs:
        try:
            u = urlparse(href.strip())
        except ValueError:
            continue
        host = (u.netloc or "").lower().removeprefix("www.").removeprefix("m.").removeprefix("fr.")
        if not host or _SOCIAL_NOISE_RE.search(u.path or ""):
            continue
        if not u.path.strip("/"):
            continue
        for network, hosts in _SOCIAL_HOSTS.items():
            if network not in out and any(host == h or host.endswith("." + h) for h in hosts):
                out[network] = f"https://{host}{u.path.rstrip('/')}"
    return out


_LINKEDIN_SECTIONS = {"company": "company", "school": "company", "showcase": "company", "in": "person", "pub": "person"}


def extract_linkedin_links(hrefs: list[str], limit: int = 10) -> list[dict[str, str]]:
    """Tous les liens LinkedIn publiés sur la page (page entreprise et profils de personnes).

    LinkedIn n'est jamais visité (CGU) : on ne garde que les liens présents sur le site de
    l'établissement, ce qui en fait des liens « vérifiés » côté CRM (E-04).
    """
    out: dict[str, dict[str, str]] = {}
    for href in hrefs:
        try:
            u = urlparse(href.strip())
        except ValueError:
            continue
        host = (u.netloc or "").lower()
        if not (host == "linkedin.com" or host.endswith(".linkedin.com")) or _SOCIAL_NOISE_RE.search(u.path or ""):
            continue
        parts = [p for p in (u.path or "").split("/") if p]
        if len(parts) < 2 or parts[0].lower() not in _LINKEDIN_SECTIONS:
            continue
        section = parts[0].lower()
        url = f"https://www.linkedin.com/{section}/{parts[1]}"
        out.setdefault(url.lower(), {"url": url, "kind": _LINKEDIN_SECTIONS[section]})
        if len(out) >= limit:
            break
    return list(out.values())


def find_contact_url(links: list[dict[str, str]], site_url: str | None) -> str | None:
    """Lien vers la page contact du site (même domaine), s'il existe."""
    site_host = (urlparse(site_url or "").netloc or "").lower().removeprefix("www.")
    best: tuple[int, str] | None = None
    for link in links:
        href = (link.get("href") or "").strip()
        if not href.startswith("http"):
            continue
        host = urlparse(href).netloc.lower().removeprefix("www.")
        if site_host and host != site_host:
            continue
        score = (2 if _CONTACT_TEXT_RE.search(link.get("text") or "") else 0) + (1 if _CONTACT_HREF_RE.search(href) else 0)
        if score and (best is None or score > best[0]):
            best = (score, href.split("#")[0])
    return best[1] if best else None


def extract_legal(text: str | None) -> dict[str, Any] | None:
    """SIREN / SIRET, forme juridique et capital lus dans les mentions légales."""
    if not text:
        return None
    out: dict[str, Any] = {}
    m = _SIRET_RE.search(text)
    if m:
        siret = _DIGITS_RE.sub("", m.group(1))
        if len(siret) == 14:
            out["siret"] = siret
            out["siren"] = siret[:9]
    if "siren" not in out:
        m = _SIREN_RE.search(text)
        if m:
            siren = _DIGITS_RE.sub("", m.group(1))
            if len(siren) == 9:
                out["siren"] = siren
    m = _LEGAL_FORM_RE.search(text)
    if m:
        out["legal_form"] = m.group(1)
    m = _CAPITAL_RE.search(text)
    if m:
        out["capital"] = re.sub(r"\s+", " ", m.group(1)).strip(" .,") + " €"
    return out or None


def merge_contacts(*parts: dict[str, Any] | None) -> dict[str, Any] | None:
    """Fusionne les contacts de plusieurs pages (accueil, contact, mentions légales)."""
    phones: dict[str, dict[str, str]] = {}
    socials: dict[str, str] = {}
    linkedin: dict[str, str] = {}
    contact_url: str | None = None
    legal: dict[str, Any] = {}
    for p in parts:
        if not p:
            continue
        for ph in p.get("phones") or []:
            phones.setdefault(ph["number"], ph)
        for k, v in (p.get("socials") or {}).items():
            if k == LINKEDIN_LINKS_KEY:
                for url in v.split():
                    linkedin.setdefault(url.lower(), url)  # union des pages visitées
            else:
                socials.setdefault(k, v)
        contact_url = contact_url or p.get("contact_url")
        for k, v in (p.get("legal") or {}).items():
            legal.setdefault(k, v)
    if linkedin:
        socials[LINKEDIN_LINKS_KEY] = " ".join(list(linkedin.values())[:10])
    if not (phones or socials or contact_url or legal):
        return None
    return {"phones": list(phones.values())[:8], "socials": socials, "contact_url": contact_url, "legal": legal or None}
