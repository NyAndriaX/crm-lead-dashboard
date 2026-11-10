import asyncio
import json
import stat

from app.claude_skills import LeadAnalyzer, run_skill

ANALYSIS = {
    "summary": "Agence immobilière indépendante à Fumay.",
    "activity": "Agence immobilière",
    "services": ["Vente", "Location"],
    "decision_maker": {"first_name": "Sophie", "last_name": "Lambert", "role": "Gérante"},
    "best_email": "s.lambert@agence.fr",
    "signals": ["Recrutement en cours"],
    "fit_score": 92,
    "fit_reason": "Indépendante, dans la zone cible.",
}


def _fake_cli(tmp_path, body: str, exit_code: int = 0):
    """Faux binaire `claude` : écrit argv dans un fichier, renvoie `body`."""
    script = tmp_path / "claude"
    script.write_text(
        "#!/bin/sh\n"
        f'printf "%s\\n" "$@" > "{tmp_path}/argv.txt"\n'
        f"cat <<'EOF'\n{body}\nEOF\n"
        f"exit {exit_code}\n"
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return str(script)


def _analyze(cli: str, emails: list[str]):
    return asyncio.run(
        LeadAnalyzer(claude_bin=cli).analyze(
            target="Agences indépendantes",
            place={"name": "Côté France Immobilier", "category": "Agence immobilière"},
            homepage={"title": "Côté France Immobilier"},
            legal_page=None,
            emails=emails,
        )
    )


def test_analyzer_returns_structured_output(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-should-not-leak")
    cli = _fake_cli(tmp_path, json.dumps({"is_error": False, "structured_output": ANALYSIS}))
    out = _analyze(cli, ["contact@agence.fr", "s.lambert@agence.fr"])
    assert out["fit_score"] == 92
    assert out["decision_maker"]["last_name"] == "Lambert"
    assert out["best_email"] == "s.lambert@agence.fr"

    argv = (tmp_path / "argv.txt").read_text().splitlines()
    assert argv[0] == "-p"
    command, data = argv[1].split(" ", 1)
    assert command == "/crm-lead-analysis"
    sent = json.loads(data)
    assert sent["target"] == "Agences indépendantes"
    assert sent["place"]["name"] == "Côté France Immobilier"
    assert "--json-schema" in argv and "--no-session-persistence" in argv


def test_analyzer_rejects_email_not_in_candidates(tmp_path):
    invented = {**ANALYSIS, "best_email": "inconnu@ailleurs.fr"}
    cli = _fake_cli(tmp_path, json.dumps({"is_error": False, "structured_output": invented}))
    out = _analyze(cli, ["contact@agence.fr"])
    assert out["best_email"] is None


def test_run_skill_returns_none_on_error(tmp_path):
    cli = _fake_cli(tmp_path, json.dumps({"is_error": True, "subtype": "error"}))
    assert asyncio.run(run_skill("crm-lead-analysis", {}, {}, claude_bin=cli)) is None


def test_run_skill_returns_none_on_nonzero_exit(tmp_path):
    cli = _fake_cli(tmp_path, "boom", exit_code=1)
    assert asyncio.run(run_skill("crm-lead-analysis", {}, {}, claude_bin=cli)) is None


def test_run_skill_returns_none_when_cli_missing():
    out = asyncio.run(run_skill("crm-lead-analysis", {}, {}, claude_bin="/nonexistent/claude"))
    assert out is None


def test_junk_emails_are_filtered():
    from app.email_extractor import _extract_from_text

    text = "photo 18e5f21f@1280x853.jpg, dpo@cloudflare.com, contact@la-boite-immo.com, agence@pentes.fr"
    assert _extract_from_text(text) == {"agence@pentes.fr"}


def test_run_skill_returns_none_on_timeout(tmp_path):
    script = tmp_path / "claude"
    script.write_text("#!/bin/sh\nsleep 5\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    out = asyncio.run(run_skill("crm-lead-analysis", {}, {}, claude_bin=str(script), timeout_ms=300))
    assert out is None


def test_analyzer_never_raises(monkeypatch):
    """Une erreur inattendue (ex. ProcessLookupError au kill) ne doit pas faire échouer la mission."""
    import app.claude_skills as cs

    async def boom(*_a, **_k):
        raise ProcessLookupError()

    monkeypatch.setattr(cs, "run_skill", boom)
    assert _analyze("claude", ["contact@agence.fr"]) is None


def test_analyzer_keeps_only_phones_found_on_site(tmp_path):
    analysis = {
        **ANALYSIS,
        "best_phone": "04 72 07 45 80",
        "decision_maker": {**ANALYSIS["decision_maker"], "email": "inconnu@ailleurs.fr", "phone": "06 99 99 99 99"},
    }
    cli = _fake_cli(tmp_path, json.dumps({"structured_output": analysis}))
    out = asyncio.run(
        LeadAnalyzer(claude_bin=cli).analyze(
            target=None, place={"name": "Agence"}, homepage={"title": "Agence"}, legal_page=None,
            emails=["s.lambert@agence.fr"], phones=["04 72 07 45 80", "06 12 34 56 78"],
        )
    )
    assert out["best_phone"] == "04 72 07 45 80"
    assert out["decision_maker"]["phone"] is None  # numéro absent du site : refusé
    assert out["decision_maker"]["email"] is None  # email absent des candidats : refusé
