from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration chargee depuis l'environnement / le fichier .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    headless: bool = True
    log_level: str = "INFO"
    locale: str = "fr-FR"
    nav_timeout_ms: int = 30000
    email_nav_timeout_ms: int = 15000
    email_page_wait_ms: int = 2000
    email_concurrency: int = 3
    scrape_timeout_ms: int = Field(
        default=630_000,
        validation_alias=AliasChoices("SCRAPE_TIMEOUT_MS", "SCRAPER_TIMEOUT_MS"),
    )
    default_max_results: int = 20
    # Proxy et rotation d'user-agent par défaut (S-06) : une mission peut les remplacer
    # (ScrapeRequest.rate), sinon ces valeurs s'appliquent. Ex. http://user:pass@hote:3128
    proxy: str | None = None
    rotate_user_agent: bool = True
    user_agent: str | None = None
    # Délai (ms) entre deux fiches / pages visitées quand la mission n'en précise pas.
    delay_ms: int = 0
    browser_executable_path: str | None = None
    api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SCRAPER_API_KEY", "API_KEY"),
    )
    # Analyse IA des fiches via Claude Skills (CLI Claude Code, abonnement — pas de clé API)
    claude_skills_enabled: bool = False
    claude_model: str = "haiku"
    claude_timeout_ms: int = 120000
    claude_max_concurrency: int = 2
    claude_bin: str = "claude"
    homepage_enrichment: bool = True
    # robots.txt (S-05) : respecté pour toutes les visites de sites (sites des établissements,
    # sites sectoriels). Le jeton déclaré est comparé aux sections User-agent du robots.txt.
    robots_txt_enforce: bool = True
    robots_user_agent: str = "CRMLeadBot/1.0 (+https://crm-lead.local/bot)"
    robots_cache_ttl_s: int = 3600
    robots_timeout_ms: int = 8000
    # Sites sectoriels (annuaires de branche, listes de membres) : pages suivies par URL de départ.
    sector_max_pages: int = 3


@lru_cache
def get_settings() -> Settings:
    return Settings()
