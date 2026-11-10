"""Extraction du contenu utile d'une page d'accueil (titre, meta, texte)."""

from __future__ import annotations

import re
from typing import Any

from playwright.async_api import Page

_MAX_BODY_CHARS = 4000
_WS_RE = re.compile(r"\s+")


def _clean(text: str | None, max_len: int | None = None) -> str | None:
    if not text:
        return None
    flat = _WS_RE.sub(" ", text.strip())
    if not flat:
        return None
    if max_len and len(flat) > max_len:
        return flat[:max_len].rstrip() + "…"
    return flat


async def extract_homepage_data(page: Page) -> dict[str, Any]:
    """Lit titre, meta description, H1 et extrait texte depuis la page courante."""
    data: dict[str, Any] = {"url": page.url}

    try:
        data["title"] = _clean(await page.title())
    except Exception:  # noqa: BLE001
        data["title"] = None

    try:
        data["meta_description"] = _clean(
            await page.locator('meta[name="description"]').first.get_attribute(
                "content"
            )
        )
    except Exception:  # noqa: BLE001
        data["meta_description"] = None

    try:
        h1s = await page.eval_on_selector_all(
            "h1",
            "els => els.map(e => (e.innerText || '').trim()).filter(Boolean)",
        )
        data["h1"] = _clean(" | ".join(h1s[:3])) if h1s else None
    except Exception:  # noqa: BLE001
        data["h1"] = None

    try:
        body_text = await page.inner_text("body")
        data["body_excerpt"] = _clean(body_text, _MAX_BODY_CHARS)
    except Exception:  # noqa: BLE001
        data["body_excerpt"] = None

    return data


def homepage_has_content(data: dict[str, Any]) -> bool:
    return bool(
        data.get("title")
        or data.get("meta_description")
        or data.get("h1")
        or data.get("body_excerpt")
    )


async def extract_page_text(page: Page, max_chars: int = 2500) -> dict[str, Any] | None:
    """Texte brut d'une page secondaire (mentions légales, contact) pour l'analyse IA."""
    try:
        text = _clean(await page.inner_text("body"), max_chars)
    except Exception:  # noqa: BLE001
        return None
    return {"url": page.url, "text_excerpt": text} if text else None
