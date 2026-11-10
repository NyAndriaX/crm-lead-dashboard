"""Paramètres de débit d'une mission (S-06) : proxy, rotation d'user-agent, délai.

Chaque mission du CRM peut transmettre ses propres réglages (``ScrapeRequest.rate``) ;
à défaut, la configuration globale du service s'applique (PROXY, ROTATE_USER_AGENT,
USER_AGENT, DELAY_MS). Fonctions pures : testables sans navigateur.
"""

from __future__ import annotations

import asyncio
import random
from contextvars import ContextVar
from dataclasses import dataclass, field
from urllib.parse import unquote, urlparse

from app.config import Settings
from app.schemas import ScrapeRate

# User agents récents et plausibles (navigateur de bureau).
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

_MAX_DELAY_MS = 60_000
_PROXY_SCHEMES = ("http", "https", "socks5", "socks4")


@dataclass(frozen=True)
class RateSettings:
    """Réglages effectifs d'une mission (mission > configuration globale)."""

    delay_ms: int = 0
    rotate_user_agent: bool = True
    proxy: dict[str, str] | None = None
    proxy_label: str | None = None
    fixed_user_agent: str = USER_AGENTS[0]
    origin: str = "serveur"
    _rng: random.Random = field(default_factory=random.Random, compare=False, repr=False)

    def user_agent(self) -> str:
        """User-agent d'un nouveau contexte : tiré au sort si la rotation est active."""
        if self.rotate_user_agent:
            return self._rng.choice(USER_AGENTS)
        return self.fixed_user_agent

    async def pause(self) -> None:
        """Attente entre deux pages / fiches (aucune si delay_ms = 0)."""
        if self.delay_ms > 0:
            await asyncio.sleep(self.delay_ms / 1000)

    def describe(self) -> str:
        return (
            f"délai={self.delay_ms} ms · rotation UA={'oui' if self.rotate_user_agent else 'non'} · "
            f"proxy={self.proxy_label or 'aucun'} (réglages {self.origin})"
        )


def parse_proxy(url: str | None) -> dict[str, str] | None:
    """URL de proxy → dictionnaire Playwright ``{server, username?, password?}``.

    Les identifiants sont extraits de l'URL (Playwright les attend à part). Renvoie None
    si l'URL est vide ou invalide.
    """
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    scheme = (parsed.scheme or "http").lower()
    if scheme not in _PROXY_SCHEMES or not parsed.hostname:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    host = parsed.hostname
    if ":" in host:  # IPv6
        host = f"[{host}]"
    server = f"{scheme}://{host}" + (f":{port}" if port else "")
    proxy: dict[str, str] = {"server": server}
    if parsed.username:
        proxy["username"] = unquote(parsed.username)
        proxy["password"] = unquote(parsed.password or "")
    return proxy


def mask_proxy(url: str | None) -> str | None:
    """Libellé du proxy pour les journaux : jamais le mot de passe."""
    proxy = parse_proxy(url)
    if not proxy:
        return None
    if "username" in proxy:
        scheme, rest = proxy["server"].split("://", 1)
        return f"{scheme}://{proxy['username']}:***@{rest}"
    return proxy["server"]


def resolve_rate(rate: ScrapeRate | None, settings: Settings) -> RateSettings:
    """Réglages de la mission, avec repli sur la configuration globale champ par champ."""
    proxy_url = (rate.proxy_url if rate and rate.proxy_url else None) or settings.proxy
    if rate is not None:
        delay = rate.delay_ms
        rotate = rate.rotate_user_agent
    else:
        delay = settings.delay_ms
        rotate = settings.rotate_user_agent
    origin = "mission" if rate is not None else "serveur"
    if rate is not None and not rate.proxy_url and settings.proxy:
        origin = "mission + proxy du serveur"
    return RateSettings(
        delay_ms=max(0, min(int(delay or 0), _MAX_DELAY_MS)),
        rotate_user_agent=bool(rotate),
        proxy=parse_proxy(proxy_url),
        proxy_label=mask_proxy(proxy_url),
        fixed_user_agent=settings.user_agent or USER_AGENTS[0],
        origin=origin,
    )


def httpx_proxy_url(proxy: dict[str, str] | None) -> str | None:
    """Proxy Playwright → URL acceptée par httpx (identifiants réintégrés)."""
    if not proxy:
        return None
    if "username" not in proxy:
        return proxy["server"]
    from urllib.parse import quote

    scheme, rest = proxy["server"].split("://", 1)
    return f"{scheme}://{quote(proxy['username'], safe='')}:{quote(proxy.get('password', ''), safe='')}@{rest}"


# Réglages de la mission en cours (hérités par les tâches parallèles de la mission).
CURRENT_RATE: ContextVar[RateSettings | None] = ContextVar("current_rate", default=None)
