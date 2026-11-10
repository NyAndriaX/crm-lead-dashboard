from app.homepage import homepage_has_content


def test_homepage_has_content_true():
    assert homepage_has_content({"title": "Agence immo", "body_excerpt": "Vente"})


def test_homepage_has_content_false():
    assert not homepage_has_content({})
