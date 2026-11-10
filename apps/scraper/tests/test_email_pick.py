"""Choix heuristique de l'email de prospection (quand l'analyse IA n'a pas pu tourner)."""
from app.email_extractor import _is_junk, _pick_best

SITE = "https://www.agence-exemple.fr/"


def test_dpo_and_rgpd_are_never_picked():
    assert _pick_best({"dpo@agence-exemple.fr"}, SITE) is None
    assert _pick_best({"rgpd@agence-exemple.fr", "privacy@agence-exemple.fr"}, SITE) is None


def test_contact_preferred_over_dpo():
    assert _pick_best({"dpo@agence-exemple.fr", "contact@agence-exemple.fr"}, SITE) == "contact@agence-exemple.fr"


def test_site_domain_preferred():
    assert _pick_best({"agence.exemple@gmail.com", "bonjour@agence-exemple.fr"}, SITE) == "bonjour@agence-exemple.fr"


def test_low_value_addresses_only_as_fallback():
    emails = {"compta@agence-exemple.fr", "recrutement@agence-exemple.fr", "agence.exemple@gmail.com"}
    assert _pick_best(emails, SITE) == "agence.exemple@gmail.com"
    assert _pick_best({"compta@agence-exemple.fr"}, SITE) == "compta@agence-exemple.fr"


def test_noreply_and_providers_are_junk():
    assert _is_junk("no-reply@agence-exemple.fr")
    assert _is_junk("support@cloudflare.com")
    assert _is_junk("logo@2x.png")
    assert not _is_junk("contact@agence-exemple.fr")
