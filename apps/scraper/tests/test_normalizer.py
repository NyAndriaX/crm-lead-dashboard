"""Tests unitaires — normalisation CRM ScrapedLead."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.normalizer import (
    build_maps_query,
    deduplicate_leads,
    filter_by_country,
    normalize_batch,
    normalize_maps_result,
    parse_address,
)
from app.schemas import Place, ScrapedLead

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
SAMPLE_RAW = FIXTURES / "sample_maps_raw.json"


@pytest.fixture
def raw_results() -> list[dict]:
    data = json.loads(SAMPLE_RAW.read_text(encoding="utf-8"))
    return data["results"]


@pytest.fixture
def query() -> str:
    return "Immobilier en france"


def test_parse_address_fumay():
    city, country = parse_address(
        "Côté France Immobilier, 60 Rue du Général de Gaulle, 08170 Fumay, France"
    )
    assert city == "Fumay"
    assert country == "France"


def test_build_maps_query():
    q = build_maps_query("Immobilier", city="Paris", country="France")
    assert q == "Immobilier Paris France"


def test_normalize_18_leads(raw_results: list[dict], query: str):
    normalized = [
        normalize_maps_result(r, query=query, defaults={"country": "France"})
        for r in raw_results
    ]
    assert len(normalized) == 18
    for raw, lead in zip(raw_results, normalized, strict=True):
        assert lead["source"] == "google_maps"
        assert lead["company"] == raw["name"]
        assert lead["name"] is None
        assert lead["sector"] == raw.get("category")


def test_normalize_company_and_name(raw_results: list[dict], query: str):
    first = normalize_maps_result(
        raw_results[0], query=query, defaults={"country": "France"}
    )
    assert first["company"] == "Côté France Immobilier – Agence immobilière"
    assert first["name"] is None
    assert first["sector"] == "Agence immobilière"
    assert first["city"] == "Fumay"
    assert first["country"] == "France"
    assert first["email"] == "contact@cotefrance.immo"
    assert first["email_status"] == "found"
    assert first["place_id"] == "ChIJN2LWTHDjwUcRzC-QKslcJ6g"


def test_place_id_present_on_most(raw_results: list[dict], query: str):
    normalized = [
        normalize_maps_result(r, query=query) for r in raw_results
    ]
    with_pid = sum(1 for l in normalized if l.get("place_id"))
    assert with_pid / len(normalized) >= 0.95


def test_procivis_shared_email_three_distinct_place_ids(
    raw_results: list[dict], query: str
):
    procivis = [
        r
        for r in raw_results
        if r.get("email") == "contact@procivis.fr"
    ]
    assert len(procivis) == 3

    leads = [
        ScrapedLead.model_validate(
            normalize_maps_result(r, query=query, defaults={"country": "France"})
        )
        for r in procivis
    ]
    deduped = deduplicate_leads(leads)
    assert len(deduped) == 3
    place_ids = {l.place_id for l in deduped}
    assert len(place_ids) == 3
    emails = {l.email for l in deduped}
    assert emails == {"contact@procivis.fr"}


def test_dedupe_same_place_id():
    lead_a = ScrapedLead(
        source="google_maps",
        company="Test",
        place_id="ChIJabc",
        city="Paris",
    )
    lead_b = lead_a.model_copy(update={"email": "other@test.fr"})
    assert len(deduplicate_leads([lead_a, lead_b])) == 1


def test_dedupe_does_not_collapse_on_email_only():
    a = ScrapedLead(
        source="google_maps",
        company="Agence A",
        city="Lyon",
        email="shared@procivis.fr",
        place_id="ChIJ1",
    )
    b = ScrapedLead(
        source="google_maps",
        company="Agence B",
        city="Marseille",
        email="shared@procivis.fr",
        place_id="ChIJ2",
    )
    assert len(deduplicate_leads([a, b])) == 2


def test_madagascar_kept_without_filter(raw_results: list[dict], query: str):
    leads = [
        ScrapedLead.model_validate(normalize_maps_result(r, query=query))
        for r in raw_results
    ]
    madagascar = [l for l in leads if l.place_id and "ChIJ916" in l.place_id]
    assert len(madagascar) == 1
    assert madagascar[0].company == "RAY Immo"


def test_madagascar_excluded_with_france_filter(raw_results: list[dict], query: str):
    leads = [
        ScrapedLead.model_validate(
            normalize_maps_result(r, query=query, defaults={"country": "France"})
        )
        for r in raw_results
    ]
    filtered, filters = filter_by_country(leads, "France")
    assert "country:France" in filters
    place_ids = {l.place_id for l in filtered}
    assert "ChIJ916HkiYB9SERPhcLV6jLKuU" not in place_ids
    assert "ChIJ7WvaLnoB9SER3SIvjiWa4AE" not in place_ids
    assert "ChIJN2LWTHDjwUcRzC-QKslcJ6g" in place_ids


def test_invalid_email_status():
    lead = normalize_maps_result(
        {
            "name": "Test Co",
            "email": "not-an-email",
            "email_status": "found",
        },
        query="test",
    )
    assert lead["email"] is None
    assert lead["email_status"] == "invalid_email"


def test_normalize_batch_from_places(raw_results: list[dict], query: str):
    places = [Place.model_validate(r) for r in raw_results[:3]]
    batch = normalize_batch(places, query=query, scraped_at="2026-05-19T12:00:00Z")
    assert len(batch) == 3
    assert all(l.scraped_at == "2026-05-19T12:00:00Z" for l in batch)
