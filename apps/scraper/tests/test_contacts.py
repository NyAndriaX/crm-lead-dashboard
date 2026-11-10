"""Extraction des données de contact complémentaires (fonctions pures, sans navigateur)."""
from app.contacts import extract_legal, extract_linkedin_links, extract_phones, extract_socials, find_contact_url, merge_contacts, normalize_fr_phone


def test_normalize_fr_phone_formats():
    assert normalize_fr_phone("04 72 07 45 80") == "+33472074580"
    assert normalize_fr_phone("+33 (0)6 12 34 56 78") == "+33612345678"
    assert normalize_fr_phone("0033 6.12.34.56.78") == "+33612345678"
    assert normalize_fr_phone("12345") is None
    assert normalize_fr_phone("00 12 34 56 78") is None


def test_extract_phones_dedup_and_kind():
    text = "Agence : 04 72 07 45 80 — Portable du gérant : 06.12.34.56.78. SIRET 123 456 789 00012"
    phones = extract_phones(text, ["tel:+33472074580"])
    numbers = [p["number"] for p in phones]
    assert numbers == ["+33472074580", "+33612345678"]
    assert phones[1]["kind"] == "mobile" and phones[0]["kind"] == "fixe"
    assert phones[1]["display"] == "06 12 34 56 78"


def test_siret_digits_are_not_phones():
    assert extract_phones("SIRET : 81234567800012") == []


def test_extract_socials_ignores_share_links():
    socials = extract_socials([
        "https://www.facebook.com/sharer/sharer.php?u=x",
        "https://www.facebook.com/AgenceDesPentes/",
        "https://fr.linkedin.com/company/agence-des-pentes",
        "https://www.instagram.com/",
    ])
    assert socials == {
        "linkedin_links": "https://www.linkedin.com/company/agence-des-pentes",
        "facebook": "https://facebook.com/AgenceDesPentes",
        "linkedin": "https://linkedin.com/company/agence-des-pentes",
    }


def test_find_contact_url_same_domain():
    links = [
        {"href": "https://autre.fr/contact", "text": "Contact"},
        {"href": "https://www.agence.fr/nous-contacter#form", "text": "Nous contacter"},
    ]
    assert find_contact_url(links, "https://agence.fr") == "https://www.agence.fr/nous-contacter"


def test_extract_legal():
    text = "Agence des Pentes, SAS au capital de 10 000 € — RCS Lyon 812 345 678 — SIRET : 812 345 678 00012"
    legal = extract_legal(text)
    assert legal == {"siret": "81234567800012", "siren": "812345678", "legal_form": "SAS", "capital": "10 000 €"}
    assert extract_legal("RCS Lyon B 812 345 678")["siren"] == "812345678"
    assert extract_legal("Aucune info") is None


def test_merge_contacts():
    a = {"phones": [{"number": "+33472074580", "display": "04", "kind": "fixe", "source": "site:tel"}], "socials": {"facebook": "f"}}
    b = {"phones": [{"number": "+33472074580", "display": "04", "kind": "fixe", "source": "site:texte"}], "legal": {"siren": "812345678"}, "contact_url": "u"}
    m = merge_contacts(a, b, None)
    assert len(m["phones"]) == 1 and m["socials"] == {"facebook": "f"} and m["legal"] == {"siren": "812345678"} and m["contact_url"] == "u"
    assert merge_contacts(None, {}) is None


def test_extract_linkedin_links_company_and_people():
    links = extract_linkedin_links([
        "https://fr.linkedin.com/company/agence-des-pentes/",
        "https://www.linkedin.com/in/marie-durand-123?trk=site",
        "https://linkedin.com/in/Marie-Durand-123",  # doublon (casse)
        "https://www.linkedin.com/shareArticle?mini=true",  # partage : ignoré
        "https://www.linkedin.com/feed/",  # pas un profil
        "https://facebook.com/agence",
    ])
    assert links == [
        {"url": "https://www.linkedin.com/company/agence-des-pentes", "kind": "company"},
        {"url": "https://www.linkedin.com/in/marie-durand-123", "kind": "person"},
    ]



def test_extract_socials_carries_all_linkedin_links():
    socials = extract_socials([
        "https://www.linkedin.com/company/agence-des-pentes",
        "https://www.linkedin.com/in/marie-durand",
    ])
    assert socials["linkedin"] == "https://linkedin.com/company/agence-des-pentes"
    assert socials["linkedin_links"] == "https://www.linkedin.com/company/agence-des-pentes https://www.linkedin.com/in/marie-durand"


def test_merge_contacts_unions_linkedin_links():
    a = {"socials": {"linkedin_links": "https://www.linkedin.com/company/x"}}
    b = {"socials": {"linkedin_links": "https://www.linkedin.com/company/X https://www.linkedin.com/in/y"}}
    m = merge_contacts(a, b)
    assert m["socials"]["linkedin_links"] == "https://www.linkedin.com/company/x https://www.linkedin.com/in/y"
