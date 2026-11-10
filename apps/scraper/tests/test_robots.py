"""S-05 — respect de robots.txt : règles, codes HTTP (RFC 9309), cache par domaine, rapport."""
import asyncio

from app.rate import CURRENT_RATE, parse_proxy, RateSettings
from app.robots import CURRENT_ROBOTS_REPORT, RobotsGuard, RobotsReport

ROBOTS = """
User-agent: *
Disallow: /prive/
Crawl-delay: 2

User-agent: CRMLeadBot
Disallow: /annuaire/export
Allow: /
"""


def make_guard(responses: dict[str, tuple[int, str]], calls: list):
    async def fetcher(url, proxy):
        calls.append((url, proxy))
        return responses.get(url, (404, ""))

    return RobotsGuard(user_agent="CRMLeadBot/1.0 (+https://crm.example/bot)", fetcher=fetcher)


def run(coro):
    return asyncio.run(coro)


def test_rules_for_declared_token():
    calls: list = []
    guard = make_guard({"https://site.fr/robots.txt": (200, ROBOTS)}, calls)
    assert guard.token == "CRMLeadBot"
    # La section propre au robot s'applique (et non celle de « * »).
    assert run(guard.allowed("https://site.fr/prive/page")) is True
    assert run(guard.allowed("https://site.fr/annuaire/export?p=1")) is False


def test_generic_section_when_no_specific_one():
    calls: list = []
    guard = make_guard({"https://autre.fr/robots.txt": (200, "User-agent: *\nDisallow: /membres\n")}, calls)
    assert run(guard.allowed("https://autre.fr/membres/liste")) is False
    assert run(guard.allowed("https://autre.fr/contact")) is True


def test_http_status_semantics():
    calls: list = []
    guard = make_guard(
        {
            "https://absent.fr/robots.txt": (404, ""),
            "https://panne.fr/robots.txt": (503, ""),
            "https://injoignable.fr/robots.txt": (0, ""),
        },
        calls,
    )
    assert run(guard.allowed("https://absent.fr/")) is True  # 4xx : pas de robots.txt
    assert run(guard.allowed("https://panne.fr/")) is False  # 5xx : tout interdit
    assert run(guard.allowed("https://injoignable.fr/")) is False  # injoignable : tout interdit


def test_cache_per_origin_and_proxy_forwarded():
    calls: list = []
    guard = make_guard({"https://site.fr/robots.txt": (200, ROBOTS)}, calls)

    async def go():
        token = CURRENT_RATE.set(RateSettings(proxy=parse_proxy("http://u:p@proxy:3128")))
        try:
            await asyncio.gather(*[guard.allowed(f"https://site.fr/page{i}") for i in range(10)])
            await guard.allowed("https://site.fr/autre")
        finally:
            CURRENT_RATE.reset(token)

    run(go())
    assert calls == [("https://site.fr/robots.txt", "http://u:p@proxy:3128")]


def test_report_and_crawl_delay():
    calls: list = []
    guard = make_guard({"https://site.fr/robots.txt": (200, "User-agent: *\nDisallow: /x\nCrawl-delay: 3\n")}, calls)
    report = RobotsReport()

    async def go():
        token = CURRENT_ROBOTS_REPORT.set(report)
        try:
            await guard.allowed("https://site.fr/")
            await guard.allowed("https://site.fr/x/1")
            return await guard.crawl_delay_s("https://site.fr/")
        finally:
            CURRENT_ROBOTS_REPORT.reset(token)

    assert run(go()) == 3.0
    meta = report.as_meta()
    assert meta["domains_checked"] == 1 and meta["pages_allowed"] == 1
    assert meta["disallowed_urls"] == ["https://site.fr/x/1"]


def test_disabled_guard_and_non_http_urls():
    calls: list = []
    guard = make_guard({}, calls)
    guard.enabled = False
    assert run(guard.allowed("https://site.fr/x")) is True
    guard.enabled = True
    assert run(guard.allowed("mailto:a@b.fr")) is True
    assert calls == []
