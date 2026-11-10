"""S-05 — extraction des établissements depuis des pages de sites sectoriels (fixtures HTML)."""
from pathlib import Path

from app.directory import extract_directory_entries, find_next_page
from app.normalizer import deduplicate_leads, filter_by_country, normalize_batch
from app.schemas import Place

FIXTURES = Path(__file__).parent / "fixtures" / "sector"
BASE = "https://www.frb-bretagne.fr/adherents"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def by_name(entries):
    return {e.name: e for e in entries}


def test_member_cards_ignore_navigation_and_socials():
    entries = by_name(extract_directory_entries(load("annuaire_cartes.html"), BASE))
    assert set(entries) == {"Maçonnerie Le Goff", "Charpentes Kervella", "Couverture Morvan & Fils"}
    legoff = entries["Maçonnerie Le Goff"]
    assert legoff.website == "https://www.maconnerie-legoff.fr"  # pas Facebook
    assert legoff.email == "contact@maconnerie-legoff.fr"
    assert legoff.phone == "02 98 45 12 34"
    assert legoff.address and "29200 Brest" in legoff.address
    assert legoff.source_url == BASE
    assert entries["Charpentes Kervella"].phone == "02 98 00 11 22"
    assert entries["Couverture Morvan & Fils"].email == "morvan.couverture@orange.fr"
    # Lien de la fédération nationale (menu) et région (pied de page) : ignorés.
    assert all("ffbatiment" not in (e.website or "") for e in entries.values())


def test_members_list_of_links():
    entries = extract_directory_entries(load("membres_liste.html"), "https://syndicat-immo.fr/membres")
    assert [(e.name, e.website) for e in entries] == [
        ("Immobilier d'Iroise", "https://www.immo-iroise.fr"),
        ("Agence des Remparts", "https://agence-des-remparts.fr"),
        ("Cabinet Arvor", "https://www.cabinet-arvor.com/accueil"),
    ]


def test_jsonld_itemlist():
    entries = by_name(extract_directory_entries(load("annuaire_jsonld.html"), "https://experts.example/annuaire"))
    durand = entries["Cabinet Durand Expertise"]
    assert (durand.website, durand.email, durand.phone) == (
        "https://www.durand-expertise.fr", "accueil@durand-expertise.fr", "+33 1 44 55 66 77",
    )
    assert durand.address == "8 avenue Foch, 75016, Paris"
    assert entries["Audit Conseil Martin"].website == "https://audit-martin.fr"


def test_table_rows():
    entries = by_name(extract_directory_entries(load("annuaire_tableau.html"), "https://cci.example/hotels"))
    assert entries["Hôtel de la Plage"].website == "https://hotel-plage-dinard.fr"
    assert entries["Hôtel de la Plage"].phone == "02 99 46 14 87"
    assert entries["Le Relais du Port"].email == "reservation@relaisduport.fr"


def test_next_page_same_site_only():
    assert find_next_page(load("annuaire_cartes.html"), BASE) == "https://www.frb-bretagne.fr/adherents?page=2"
    assert find_next_page(load("membres_liste.html"), BASE) is None
    assert find_next_page('<a rel="next" href="https://ailleurs.fr/p2">Suivant</a>', BASE) is None


def test_sector_places_join_maps_pipeline():
    """Même normalisation / dédoublonnage que Google Maps ; doublon par site web écarté."""
    maps = Place(name="Maçonnerie Le Goff", website="https://maconnerie-legoff.fr", place_id="ChIJ1",
                 address="12 rue des Forges, 29200 Brest, France")
    sector = [
        Place(name="Maçonnerie Le Goff SARL", website="http://www.maconnerie-legoff.fr/", source="directories",
              source_url=BASE),
        Place(name="Charpentes Kervella", website="http://charpentes-kervella.bzh", email="contact@kervella.bzh",
              source="directories", source_url=BASE),
    ]
    leads = deduplicate_leads(normalize_batch([maps, *sector], query="maçon"))
    assert [(lead.company, lead.source) for lead in leads] == [
        ("Maçonnerie Le Goff", "google_maps"),
        ("Charpentes Kervella", "directories"),
    ]
    assert leads[1].email == "contact@kervella.bzh" and leads[1].source_url == BASE
    # Sans adresse, un établissement sectoriel n'est pas écarté par le filtre pays.
    kept, _ = filter_by_country(leads, "France")
    assert {lead.company for lead in kept} == {"Maçonnerie Le Goff", "Charpentes Kervella"}
