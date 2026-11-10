"""Analyse avec un fournisseur compatible OpenAI (DeepSeek, OpenAI, Ollama…) choisi dans le CRM."""
import asyncio
import json

import httpx

import app.claude_skills as cs
from app.claude_skills import AI_SETTINGS, LeadAnalyzer
from app.schemas import AiSettings

ANALYSIS = {
    "summary": "Agence immobilière indépendante.",
    "activity": "Agence immobilière",
    "services": ["Vente"],
    "decision_maker": None,
    "best_email": "contact@agence.fr",
    "best_phone": None,
    "signals": [],
    "fit_score": 80,
    "fit_reason": "Indépendante.",
}


def _patch_http(monkeypatch, content: str, seen: dict):
    real = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(cs.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def _analyze(cfg: AiSettings):
    async def go():
        token = AI_SETTINGS.set(cfg)
        try:
            return await LeadAnalyzer(env_enabled=False).analyze(
                target="Agences indépendantes", place={"name": "Agence"}, homepage={"title": "Agence"},
                legal_page=None, emails=["contact@agence.fr"],
            )
        finally:
            AI_SETTINGS.reset(token)
    return asyncio.run(go())


CFG = AiSettings(provider="deepseek", kind="openai-compatible", model="deepseek-chat", fast_model="deepseek-chat",
                 base_url="https://api.deepseek.com/v1", api_key="sk-test", json_mode="json_object")


def test_openai_compatible_provider(monkeypatch):
    seen: dict = {}
    _patch_http(monkeypatch, json.dumps(ANALYSIS), seen)
    out = _analyze(CFG)
    assert out["fit_score"] == 80 and out["best_email"] == "contact@agence.fr"
    assert seen["url"] == "https://api.deepseek.com/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-test"
    assert seen["body"]["model"] == "deepseek-chat"
    # Les instructions viennent du même SKILL.md que pour Claude.
    assert "crm" in seen["body"]["messages"][0]["content"].lower() or "score" in seen["body"]["messages"][0]["content"].lower()


def test_invalid_response_is_rejected(monkeypatch):
    _patch_http(monkeypatch, json.dumps({"summary": "x"}), {})
    assert _analyze(CFG) is None


def test_disabled_by_crm(monkeypatch):
    _patch_http(monkeypatch, json.dumps(ANALYSIS), {})
    assert _analyze(CFG.model_copy(update={"enabled": False})) is None
