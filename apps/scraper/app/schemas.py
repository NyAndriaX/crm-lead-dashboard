from typing import Any, Literal

from pydantic import BaseModel, Field

EmailStatusValue = Literal[
    "found",
    "found_legal",
    "no_email",
    "no_website",
    "invalid_email",
    "unreachable",
    "skipped",
    "robots_disallowed",
]

# google_maps : fiche Maps ; directories : établissement lu sur un site sectoriel (annuaire, liste de membres).
ScrapeSourceValue = Literal["google_maps", "directories"]


# --- Modèle interne (résultat brut Google Maps) ---


class Place(BaseModel):
    """Fiche établissement telle que retournée par le parseur Maps."""

    name: str
    rating: float | None = None
    reviews: int | None = None
    category: str | None = None
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    maps_url: str | None = None
    email: str | None = None
    email_status: EmailStatusValue | None = None
    enrichment: str | None = None
    contact_name: str | None = None
    contact_role: str | None = None
    ai: dict[str, Any] | None = None
    contacts: dict[str, Any] | None = None
    source: ScrapeSourceValue = "google_maps"
    source_url: str | None = None


class LeadAI(BaseModel):
    """Analyse IA d'un établissement (skill crm-lead-analysis)."""

    summary: str
    activity: str | None = None
    services: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)
    fit_score: int = Field(..., ge=0, le=100)
    fit_reason: str | None = None
    decision_maker_role: str | None = None
    decision_maker_email: str | None = None
    decision_maker_phone: str | None = None
    best_phone: str | None = None


class LeadContacts(BaseModel):
    """Contacts complémentaires lus sur le site (voir app/contacts.py)."""

    phones: list[dict[str, str]] = Field(default_factory=list)
    socials: dict[str, str] = Field(default_factory=dict)
    contact_url: str | None = None
    legal: dict[str, Any] | None = None


# --- Contrat CRM (ScrapedLead) ---


class ScrapedLead(BaseModel):
    source: ScrapeSourceValue = "google_maps"
    company: str | None = None
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    sector: str | None = None
    rating: float | None = None
    reviews: int | None = None
    place_id: str | None = None
    maps_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    email_status: EmailStatusValue | None = None
    enrichment: str | None = None
    contact_role: str | None = None
    ai: LeadAI | None = None
    contacts: LeadContacts | None = None
    source_url: str | None = None
    query: str | None = None
    scraped_at: str | None = None


class ScrapeLocation(BaseModel):
    city: str | None = None
    country: str | None = None
    radius_km: float | None = Field(None, alias="radiusKm")

    model_config = {"populate_by_name": True}


class ScrapeRate(BaseModel):
    """Réglages de débit propres à la mission (S-06) ; absents → configuration globale."""

    delay_ms: int = Field(0, ge=0, le=60_000, alias="delayMs")
    retries: int = 0
    rotate_user_agent: bool = Field(True, alias="rotateUserAgent")
    proxy_url: str | None = Field(None, alias="proxyUrl", repr=False)

    model_config = {"populate_by_name": True}


class AiSettings(BaseModel):
    """Fournisseur d'IA choisi par l'administrateur du CRM, transmis avec chaque mission."""

    enabled: bool = True
    provider: str = "claude-skills"
    kind: Literal["skills", "openai-compatible"] = "skills"
    model: str | None = None
    fast_model: str | None = None
    base_url: str | None = None
    api_key: str | None = Field(None, repr=False)
    json_mode: Literal["json_schema", "json_object"] | None = None


class ScrapeRequest(BaseModel):
    """Aligné sur ScrapeConfig du worker CRM (Option A — HTTP pull)."""

    keywords: str = Field(
        ...,
        min_length=2,
        description="Mots-clés de recherche Google Maps",
        examples=["Immobilier"],
    )
    queries: list[str] | None = Field(
        None,
        max_length=8,
        description=(
            "Requêtes Maps complètes (métier + zone, sans le pays) générées par le plan IA ; "
            "prioritaires sur keywords/location.city"
        ),
    )
    target: str | None = Field(
        None,
        max_length=2000,
        description="Profil cible : sert au score d'adéquation de l'analyse IA",
    )
    location: ScrapeLocation = Field(default_factory=ScrapeLocation)
    limit: int = Field(20, ge=1, le=120)
    detailed: bool = Field(
        True,
        description="Visiter chaque site web pour extraire l'email",
    )
    locale: str | None = Field(None, description="Langue Maps, ex. fr-FR")
    ai: AiSettings | None = Field(None, description="Fournisseur d'IA pour l'analyse des sites (sinon réglage du serveur)")
    filter_country: bool = Field(
        True,
        description=(
            "Si true et location.country renseigné, exclut les fiches hors pays"
        ),
    )
    sources: list[str] | None = Field(
        None,
        description="Ignoré si absent de google_maps — conservé pour compat CRM",
    )
    company_type: str | None = Field(None, alias="companyType")
    language: str | None = None
    rate: ScrapeRate | None = Field(None, description="Délai, rotation d'user-agent et proxy de la mission")
    sector_sites: list[str] | None = Field(
        None,
        alias="sectorSites",
        max_length=10,
        description="Pages de sites sectoriels (annuaires de branche, listes de membres) à visiter en plus de Maps",
    )

    model_config = {"populate_by_name": True}


class SearchRequest(BaseModel):
    """Ancien format — conservé pour rétrocompatibilité."""

    query: str = Field(..., min_length=2)
    max_results: int = Field(20, ge=1, le=120)
    detailed: bool = True
    locale: str | None = None
    filter_country: str | None = Field(
        None,
        description="Ex. France — exclut les fiches hors pays si renseigné",
    )


class ScrapeMeta(BaseModel):
    duration_ms: int | None = None
    filters_applied: list[str] = Field(default_factory=list)
    # Bilan robots.txt (domaines contrôlés, pages ignorées) et réglages de débit appliqués.
    robots: dict[str, Any] | None = None
    rate: dict[str, Any] | None = None
    sources: dict[str, int] = Field(default_factory=dict)


class ScrapeResponse(BaseModel):
    ok: bool = True
    query: str
    count: int
    source: Literal["google_maps"] = "google_maps"
    scraped_at: str
    results: list[ScrapedLead]
    meta: ScrapeMeta = Field(default_factory=ScrapeMeta)
    error: str | None = None


class ErrorResponse(BaseModel):
    ok: bool = False
    error: str
    results: list[ScrapedLead] = Field(default_factory=list)
