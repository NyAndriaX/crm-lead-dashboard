"""Gestionnaire du navigateur Playwright (Chromium) avec playwright-stealth."""

from __future__ import annotations

import asyncio

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)
from playwright_stealth import stealth_async

from app.config import Settings
from app.rate import USER_AGENTS

_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]


class BrowserManager:
    """Cycle de vie d'un Chromium partage. Un contexte isole par requete."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._started = False
        self._lock = asyncio.Lock()

    async def ensure_started(self) -> None:
        """Démarre Chromium à la demande (pas au boot — allège CPU au repos)."""
        async with self._lock:
            if not self._started:
                await self.start()
                self._started = True

    async def start(self) -> None:
        if self._browser is not None:
            return
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=self._settings.headless,
            # Optionnel : navigateur du système (ex. /usr/bin/google-chrome) au lieu du Chromium Playwright.
            executable_path=self._settings.browser_executable_path or None,
            args=_LAUNCH_ARGS,
            # Pas de proxy global : il est appliqué par contexte (mission, sinon PROXY du serveur),
            # voir new_page() et app/rate.py.
        )

    async def stop(self) -> None:
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._pw is not None:
            await self._pw.stop()
            self._pw = None
        self._started = False

    async def new_page(
        self,
        locale: str | None = None,
        *,
        proxy: dict[str, str] | None = None,
        user_agent: str | None = None,
    ) -> tuple[BrowserContext, Page]:
        """Nouveau contexte isolé : proxy et user-agent propres (réglages de la mission)."""
        if self._browser is None:
            raise RuntimeError("Le navigateur n'est pas demarre")

        context = await self._browser.new_context(
            locale=locale or self._settings.locale,
            user_agent=user_agent or USER_AGENTS[0],
            viewport={"width": 1366, "height": 900},
            timezone_id="Indian/Antananarivo",
            proxy=proxy,  # type: ignore[arg-type]
        )
        page = await context.new_page()
        page.set_default_timeout(self._settings.nav_timeout_ms)
        # Applique les patchs anti-detection (navigator.webdriver, etc.).
        await stealth_async(page)
        return context, page
