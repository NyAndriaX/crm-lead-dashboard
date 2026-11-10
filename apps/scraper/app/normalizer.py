"""Normalisation des fiches Google Maps vers le contrat CRM ScrapedLead."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from app.schemas import Place, ScrapedLead

_SOURCE = "google_maps"

# Code postal FR + ville (ex. « 08170 Fumay »).
_FR_POSTAL_CITY_RE = re.compile(
    r"\b(\d{5})\s+([^,\d]+?)(?:\s*,|\s*$)",
    re.UNICODE,
)

# Ville après virgule avant le pays (ex. « …, Paris, France »).
_CITY_BEFORE_COUNTRY_RE = re.compile(
    r",\s*([^,]+?)\s*,\s*(?:France|FR)\s*$",
    re.IGNORECASE | re.UNICODE,
)

_COUNTRY_TAIL_RE = re.compile(
    r",\s*((?:France|FR|Madagascar|MG|Belgique|BE|Suisse|CH|"
    r"Canada|CA|United States|USA|US))\s*$",
    re.IGNORECASE,
)

_EMAIL_VALID_RE = re.compile(
    r"^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$"
)

# France métropolitaine (bbox approximative WGS84).
_FR_BBOX = {
    "min_lat": 41.0,
    "max_lat": 51.5,
    "min_lon": -5.5,
    "max_lon": 9.8,
}

_EXPORT_EMAIL_STATUSES = frozenset(
    {
        "found",
        "found_legal",
        "no_email",
        "no_website",
        "invalid_email",
        "unreachable",
        "skipped",
    }
)


def parse_address(address: str | None) -> tuple[str | None, str | None]:
    """Extrait ville et pays depuis une adresse Google Maps."""
    if not address or not address.strip():
        return None, None

    text = address.strip()
    country: str | None = None
    m_country = _COUNTRY_TAIL_RE.search(text)
    if m_country:
        raw = m_country.group(1).strip()
        country = _normalize_country_name(raw)

    city: str | None = None
    m_fr = _FR_POSTAL_CITY_RE.search(text)
    if m_fr:
        city = m_fr.group(2).strip()
    if not city:
        m_city = _CITY_BEFORE_COUNTRY_RE.search(text)
        if m_city:
            city = m_city.group(1).strip()

    return city or None, country


def _normalize_country_name(raw: str) -> str:
    upper = raw.upper()
    mapping = {
        "FR": "France",
        "FRANCE": "France",
        "MG": "Madagascar",
        "MADAGASCAR": "Madagascar",
        "BE": "Belgique",
        "BELGIQUE": "Belgique",
        "CH": "Suisse",
        "SUISSE": "Suisse",
        "CA": "Canada",
        "CANADA": "Canada",
        "US": "United States",
        "USA": "United States",
        "UNITED STATES": "United States",
    }
    return mapping.get(upper, raw.strip().title())


def _normalize_email(raw: str | None) -> tuple[str | None, str | None]:
    """Retourne (email, email_status_override) — override si format invalide."""
    if not raw:
        return None, None
    email = raw.strip().lower()
    if not email:
        return None, None
    if _EMAIL_VALID_RE.match(email):
        return email, None
    return None, "invalid_email"


def _coerce_email_status(raw_status: str | None) -> str | None:
    if raw_status is None:
        return None
    status = str(raw_status).strip().lower()
    if status in _EXPORT_EMAIL_STATUSES:
        return status
    return None


def build_maps_query(
    keywords: str,
    city: str | None = None,
    country: str | None = None,
) -> str:
    parts = [keywords.strip()]
    if city and city.strip():
        parts.append(city.strip())
    if country and country.strip():
        parts.append(country.strip())
    return " ".join(p for p in parts if p)


def normalize_maps_result(
    raw: dict[str, Any],
    query: str,
    defaults: dict[str, Any] | None = None,
    scraped_at: str | None = None,
) -> dict[str, Any]:
    """Transforme une fiche Maps brute (dict) en dict ScrapedLead CRM."""
    defaults = defaults or {}
    default_country = defaults.get("country")

    # Rétrocompat : ancien champ Maps `name` → `company` ; `name` = contact humain.
    company = raw.get("company") or raw.get("name")
    human_name = raw.get("contact_name") or raw.get("contact")
    if isinstance(human_name, str):
        human_name = human_name.strip() or None
    else:
        human_name = None

    address = raw.get("address")
    city, country = parse_address(address)
    if country is None and default_country:
        country = default_country

    email, invalid_status = _normalize_email(raw.get("email"))
    email_status = _coerce_email_status(raw.get("email_status"))
    if invalid_status:
        email_status = invalid_status

    sector = raw.get("sector") or raw.get("category")

    lead = ScrapedLead(
        source=raw.get("source") or _SOURCE,
        company=company,
        name=human_name,
        email=email,
        phone=raw.get("phone"),
        website=raw.get("website"),
        address=address,
        city=city,
        country=country,
        sector=sector,
        rating=raw.get("rating"),
        reviews=raw.get("reviews"),
        place_id=raw.get("place_id"),
        maps_url=raw.get("maps_url"),
        latitude=raw.get("latitude"),
        longitude=raw.get("longitude"),
        email_status=email_status,
        enrichment=raw.get("enrichment") or raw.get("homepage_summary"),
        contact_role=raw.get("contact_role"),
        ai=raw.get("ai") or None,
        contacts=raw.get("contacts") or None,
        source_url=raw.get("source_url"),
        query=query or raw.get("query"),
        scraped_at=scraped_at,
    )
    return lead.model_dump(mode="json", exclude_none=False)


def normalize_place(
    place: Place,
    query: str,
    defaults: dict[str, Any] | None = None,
    scraped_at: str | None = None,
) -> ScrapedLead:
    """Normalise un objet Place interne."""
    data = normalize_maps_result(
        place.model_dump(),
        query=query,
        defaults=defaults,
        scraped_at=scraped_at,
    )
    return ScrapedLead.model_validate(data)


def normalize_batch(
    places: list[Place],
    query: str,
    defaults: dict[str, Any] | None = None,
    scraped_at: str | None = None,
) -> list[ScrapedLead]:
    ts = scraped_at or datetime.now(UTC).replace(microsecond=0).isoformat()
    return [
        normalize_place(pl, query=query, defaults=defaults, scraped_at=ts)
        for pl in places
    ]


def _lead_dedup_key(lead: ScrapedLead) -> str:
    if lead.place_id:
        return f"pid:{lead.place_id}"
    company = (lead.company or "").strip().lower()
    city = (lead.city or "").strip().lower()
    return f"cc:{company}|{city}"


def website_domain(url: str | None) -> str | None:
    """Domaine d'un site (sans www.) — clé de dédoublonnage entre sources."""
    if not url or not url.strip():
        return None
    raw = url.strip()
    if "://" not in raw:
        raw = f"https://{raw}"
    host = re.sub(r"^www\.", "", (re.match(r"^[a-z]+://([^/:?#]+)", raw.lower()) or [None, ""])[1] or "")
    return host or None


def deduplicate_leads(leads: list[ScrapedLead]) -> list[ScrapedLead]:
    """Déduplique sur place_id, sinon (company, city). Ne déduplique pas sur email.

    Les établissements des sites sectoriels (sans place_id) sont aussi écartés quand leur
    site web correspond à une fiche déjà retenue (Google Maps en premier).
    """
    seen: set[str] = set()
    domains: set[str] = set()
    out: list[ScrapedLead] = []
    for lead in leads:
        key = _lead_dedup_key(lead)
        domain = website_domain(lead.website)
        if key in seen or (lead.source != "google_maps" and domain and domain in domains):
            continue
        seen.add(key)
        if domain:
            domains.add(domain)
        out.append(lead)
    return out


def _coords_in_france_bbox(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    return (
        _FR_BBOX["min_lat"] <= lat <= _FR_BBOX["max_lat"]
        and _FR_BBOX["min_lon"] <= lon <= _FR_BBOX["max_lon"]
    )


def _address_mentions_france(address: str | None) -> bool:
    if not address:
        return False
    return bool(re.search(r"\b(?:France|FR)\b", address, re.I))


def filter_by_country(
    leads: list[ScrapedLead],
    country: str | None,
) -> tuple[list[ScrapedLead], list[str]]:
    """Filtre géographique optionnel (ex. country='France')."""
    if not country or not country.strip():
        return leads, []

    target = country.strip().lower()
    filters_applied = [f"country:{country.strip()}"]

    # Sites sectoriels : choisis par l'utilisateur, souvent sans adresse — exclus seulement si
    # leur adresse indique clairement un autre pays.
    sector = [
        lead
        for lead in leads
        if lead.source != "google_maps"
        and (not lead.country or lead.country.strip().lower() in (target, target[:2]))
    ]
    leads = [lead for lead in leads if lead.source == "google_maps"]

    if target not in ("france", "fr"):
        filtered = [
            lead
            for lead in leads
            if (lead.country or "").strip().lower() in (target, target[:2])
        ]
        return filtered + sector, filters_applied

    kept: list[ScrapedLead] = []
    for lead in leads:
        if _address_mentions_france(lead.address):
            kept.append(lead)
            continue
        if _coords_in_france_bbox(lead.latitude, lead.longitude):
            kept.append(lead)
            continue
        _, parsed_country = parse_address(lead.address)
        if parsed_country and parsed_country.strip().lower() in (
            "france",
            "fr",
        ):
            kept.append(lead)
    return kept + sector, filters_applied
