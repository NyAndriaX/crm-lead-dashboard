"""S-06 — réglages de débit par mission (proxy, rotation d'user-agent, délai) et repli global."""
import asyncio
import random
import time

from app.config import Settings
from app.rate import USER_AGENTS, RateSettings, httpx_proxy_url, mask_proxy, parse_proxy, resolve_rate
from app.schemas import ScrapeRate, ScrapeRequest


def test_parse_proxy_extracts_credentials():
    assert parse_proxy("http://alice:s%40cret@proxy.local:3128") == {
        "server": "http://proxy.local:3128",
        "username": "alice",
        "password": "s@cret",
    }
    assert parse_proxy("proxy.local:8080") == {"server": "http://proxy.local:8080"}
    assert parse_proxy("socks5://10.0.0.1:1080") == {"server": "socks5://10.0.0.1:1080"}
    assert parse_proxy("") is None
    assert parse_proxy("ftp://x:21") is None
    assert parse_proxy("http://host:notaport") is None


def test_mask_proxy_never_shows_password():
    assert mask_proxy("http://alice:topsecret@proxy.local:3128") == "http://alice:***@proxy.local:3128"
    assert "topsecret" not in repr(ScrapeRate(proxyUrl="http://alice:topsecret@p:1"))
    assert mask_proxy(None) is None


def test_httpx_proxy_url_roundtrip():
    proxy = parse_proxy("http://a%20b:p%3Aw@h:1")
    assert httpx_proxy_url(proxy) == "http://a%20b:p%3Aw@h:1"
    assert httpx_proxy_url(None) is None


def test_mission_rate_overrides_global_settings():
    settings = Settings(proxy="http://global:3128", rotate_user_agent=True, delay_ms=500)
    rate = resolve_rate(ScrapeRate(delayMs=1500, rotateUserAgent=False, proxyUrl="http://u:p@mission:8000"), settings)
    assert rate.delay_ms == 1500
    assert rate.rotate_user_agent is False
    assert rate.proxy == {"server": "http://mission:8000", "username": "u", "password": "p"}
    assert rate.origin == "mission"


def test_fallback_to_global_settings():
    settings = Settings(proxy="http://global:3128", rotate_user_agent=False, delay_ms=700, user_agent="UA-fixe")
    rate = resolve_rate(None, settings)
    assert (rate.delay_ms, rate.rotate_user_agent, rate.proxy, rate.origin) == (
        700, False, {"server": "http://global:3128"}, "serveur",
    )
    assert rate.user_agent() == "UA-fixe"
    # Mission sans proxy : le proxy du serveur reste appliqué.
    partial = resolve_rate(ScrapeRate(delayMs=0, rotateUserAgent=True), settings)
    assert partial.proxy == {"server": "http://global:3128"}
    assert partial.origin == "mission + proxy du serveur"


def test_delay_is_clamped():
    assert resolve_rate(None, Settings(delay_ms=-5)).delay_ms == 0
    assert resolve_rate(None, Settings(delay_ms=10**7)).delay_ms == 60_000


def test_user_agent_rotation():
    rotating = RateSettings(rotate_user_agent=True, _rng=random.Random(1))
    seen = {rotating.user_agent() for _ in range(40)}
    assert len(seen) > 1 and seen <= set(USER_AGENTS)
    fixed = RateSettings(rotate_user_agent=False, fixed_user_agent="Fixe/1.0")
    assert {fixed.user_agent() for _ in range(5)} == {"Fixe/1.0"}


def test_pause_waits_delay():
    t0 = time.perf_counter()
    asyncio.run(RateSettings(delay_ms=120).pause())
    assert time.perf_counter() - t0 >= 0.11
    t0 = time.perf_counter()
    asyncio.run(RateSettings(delay_ms=0).pause())
    assert time.perf_counter() - t0 < 0.05


def test_scrape_request_accepts_crm_payload():
    req = ScrapeRequest.model_validate({
        "keywords": "plombier",
        "rate": {"delayMs": 2000, "retries": 2, "rotateUserAgent": True, "proxyUrl": "http://p:1"},
        "sectorSites": ["https://annuaire.example/membres"],
    })
    assert req.rate is not None and req.rate.delay_ms == 2000 and req.rate.proxy_url == "http://p:1"
    assert req.sector_sites == ["https://annuaire.example/membres"]
