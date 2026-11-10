"""Analyse IA des établissements scrapés, avec le fournisseur choisi dans le CRM.

Les instructions vivent dans le skill `crm-lead-analysis` (`.claude/skills/`), quel que soit le moteur :
- Claude Skills (défaut) : CLI Claude Code en mode headless (`CLAUDE_CODE_OAUTH_TOKEN`), données passées
  en argument du skill (sur stdin le skill ne serait pas chargé), sortie validée par JSON Schema ;
- OpenAI, DeepSeek, Mistral, Gemini, Ollama… : API Chat Completions avec le même SKILL.md en instructions,
  sortie validée contre le même schéma.
Le CRM transmet le fournisseur avec chaque mission (`ScrapeRequest.ai`) ; à défaut, réglage du serveur.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
from contextvars import ContextVar
from pathlib import Path

import httpx

from app.log import get_logger
from app.schemas import AiSettings

logger = get_logger("claude")



def _skills_root() -> Path:
    """Dossier contenant `.claude/skills` : CLAUDE_SKILLS_ROOT, sinon remontée depuis ce fichier
    (racine du monorepo en dev, /app dans l'image Docker)."""
    env = os.environ.get("CLAUDE_SKILLS_ROOT", "").strip()
    if env:
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / ".claude" / "skills").is_dir():
            return parent
    return Path.cwd()


_PROJECT_ROOT = _skills_root()

# Fournisseur d'IA de la mission en cours (posé par le pipeline, hérité par les analyses parallèles).
AI_SETTINGS: ContextVar[AiSettings | None] = ContextVar("ai_settings", default=None)

_SYSTEM = (
    "Tu es le moteur d'exécution des skills d'un CRM B2B francophone. "
    "Applique strictement le skill invoqué aux données JSON fournies en entrée "
    "et renvoie uniquement la sortie structurée demandée. N'invente aucun fait "
    "absent des données."
)

# Linux limite un argument à 128 Kio (MAX_ARG_STRLEN) : marge de sécurité.
_MAX_INPUT_BYTES = 100_000

_NULLABLE_STR = {"anyOf": [{"type": "string"}, {"type": "null"}]}

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "minLength": 1, "maxLength": 1500},
        "activity": {"type": "string", "maxLength": 120},
        "services": {"type": "array", "items": {"type": "string", "maxLength": 120}, "maxItems": 6},
        "decision_maker": {
            "anyOf": [
                {
                    "type": "object",
                    "properties": {
                        "first_name": {"type": "string"},
                        "last_name": {"type": "string"},
                        "role": {"type": "string"},
                        "email": _NULLABLE_STR,
                        "phone": _NULLABLE_STR,
                    },
                    "required": ["first_name", "last_name", "role", "email", "phone"],
                    "additionalProperties": False,
                },
                {"type": "null"},
            ]
        },
        "best_email": _NULLABLE_STR,
        "best_phone": _NULLABLE_STR,
        "signals": {"type": "array", "items": {"type": "string", "maxLength": 160}, "maxItems": 5},
        "fit_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "fit_reason": {"type": "string", "maxLength": 400},
    },
    "required": [
        "summary", "activity", "services", "decision_maker",
        "best_email", "best_phone", "signals", "fit_score", "fit_reason",
    ],
    "additionalProperties": False,
}


async def run_skill(
    skill: str,
    payload: dict,
    schema: dict,
    *,
    model: str = "haiku",
    timeout_ms: int = 120000,
    claude_bin: str = "claude",
    oauth_token: str | None = None,
) -> dict | None:
    """Exécute un skill avec le CLI Claude Code et renvoie `structured_output`, ou None en cas d'échec."""
    data = json.dumps(payload, ensure_ascii=False)
    if len(data.encode()) > _MAX_INPUT_BYTES:
        logger.warning("Skill %s : entrée trop volumineuse", skill)
        return None
    args = [
        claude_bin,
        "-p", f"/{skill} {data}",
        "--output-format", "json",
        "--json-schema", json.dumps(schema),
        "--model", model,
        "--system-prompt", _SYSTEM,
        # Contexte minimal et reproductible : aucun outil, aucune config utilisateur/MCP.
        "--tools", "",
        "--setting-sources", "project",
        "--strict-mcp-config",
        "--no-session-persistence",
    ]
    # Jamais de bascule en facturation API.
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=_PROJECT_ROOT,
            env=env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        logger.warning("CLI Claude introuvable (%s) — skill %s ignoré", claude_bin, skill)
        return None

    try:
        out, err = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout_ms / 1000,
        )
    except asyncio.TimeoutError:
        # Le processus peut s'être terminé entre le timeout et le kill : ce n'est pas une erreur.
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        with contextlib.suppress(Exception):
            await proc.wait()
        logger.warning("Skill %s : timeout %s ms", skill, timeout_ms)
        return None

    if proc.returncode != 0:
        logger.warning("Skill %s : exit %s — %s", skill, proc.returncode, (err or out)[:200])
        return None
    try:
        body = json.loads(out)
    except json.JSONDecodeError:
        logger.warning("Skill %s : sortie non JSON", skill)
        return None
    if body.get("is_error") or not isinstance(body.get("structured_output"), dict):
        logger.warning("Skill %s : pas de sortie structurée (%s)", skill, body.get("subtype"))
        return None
    return body["structured_output"]


def _skill_instructions(skill: str) -> str | None:
    try:
        raw = (_PROJECT_ROOT / ".claude" / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
    except OSError:
        return None
    return re.sub(r"^---\n.*?\n---\n?", "", raw, count=1, flags=re.S).strip()


def matches_schema(value: object, schema: dict) -> bool:
    """Validation du sous-ensemble de JSON Schema utilisé par nos tâches (miroir de @crm/ai)."""
    if "anyOf" in schema:
        return any(matches_schema(value, s) for s in schema["anyOf"])
    if "enum" in schema and value not in schema["enum"]:
        return False
    t = schema.get("type")
    checks = {
        "null": lambda v: v is None,
        "string": lambda v: isinstance(v, str),
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "boolean": lambda v: isinstance(v, bool),
        "array": lambda v: isinstance(v, list),
        "object": lambda v: isinstance(v, dict),
    }
    if t and not any(checks.get(x, lambda v: True)(value) for x in (t if isinstance(t, list) else [t])):
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            return False
        if "maximum" in schema and value > schema["maximum"]:
            return False
    if isinstance(value, list) and "items" in schema:
        return all(matches_schema(v, schema["items"]) for v in value)
    if isinstance(value, dict) and "properties" in schema:
        if any(k not in value for k in schema.get("required", [])):
            return False
        return all(matches_schema(value[k], sub) for k, sub in schema["properties"].items() if k in value)
    return True


async def run_chat_completion(
    cfg: AiSettings, skill: str, payload: dict, schema: dict, *, fast: bool, timeout_ms: int
) -> dict | None:
    """Exécute un skill via une API Chat Completions (OpenAI, DeepSeek, Mistral, Gemini, Ollama…)."""
    model = (cfg.fast_model if fast else None) or cfg.model
    instructions = _skill_instructions(skill)
    if not (cfg.base_url and model and instructions):
        logger.warning("Skill %s via %s : configuration incomplète", skill, cfg.provider)
        return None
    system = "\n\n".join([
        _SYSTEM, "Instructions de la tâche :", instructions,
        "Réponds UNIQUEMENT par un objet JSON valide conforme à ce schéma, sans texte autour :", json.dumps(schema),
    ])
    response_format = (
        {"type": "json_schema", "json_schema": {"name": skill.replace("-", "_"), "schema": schema, "strict": False}}
        if cfg.json_mode == "json_schema" else {"type": "json_object"}
    )
    headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
    body = {
        "model": model, "temperature": 0.2, "response_format": response_format,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    }
    try:
        async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
            res = await client.post(f"{cfg.base_url.rstrip('/')}/chat/completions", json=body, headers=headers)
        if res.status_code >= 400:
            logger.warning("Skill %s via %s : HTTP %s", skill, cfg.provider, res.status_code)
            return None
        content = (res.json().get("choices") or [{}])[0].get("message", {}).get("content") or ""
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Skill %s via %s : %s", skill, cfg.provider, exc.__class__.__name__)
        return None
    m = re.search(r"\{.*\}", content, flags=re.S)
    try:
        out = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        out = None
    if not isinstance(out, dict) or not matches_schema(out, schema):
        logger.warning("Skill %s via %s : réponse invalide", skill, cfg.provider)
        return None
    return out


class LeadAnalyzer:
    """Analyse un établissement avec le skill `crm-lead-analysis` : résumé, décideur,
    meilleur email, signaux d'achat et score d'adéquation à la cible de la mission."""

    def __init__(
        self,
        model: str = "haiku",
        timeout_ms: int = 120000,
        claude_bin: str = "claude",
        max_concurrency: int = 2,
        env_enabled: bool = True,
    ) -> None:
        # Sans fournisseur transmis par le CRM, on suit le réglage du serveur (CLAUDE_SKILLS_ENABLED).
        self._env_enabled = env_enabled
        self._model = model
        self._timeout_ms = timeout_ms
        self._bin = claude_bin
        # Les sites sont visités en parallèle : on borne les process `claude`.
        self._sem = asyncio.Semaphore(max(1, max_concurrency))

    async def analyze(
        self,
        *,
        target: str | None,
        place: dict,
        homepage: dict | None,
        legal_page: dict | None,
        emails: list[str],
        phones: list[str] | None = None,
    ) -> dict | None:
        payload = {
            "target": target,
            "place": {
                k: place.get(k)
                for k in ("name", "category", "rating", "reviews", "address", "website")
            },
            "homepage": homepage,
            "legal_page": legal_page,
            "emails": emails[:15],
            "phones": (phones or [])[:8],
        }
        # L'analyse est un bonus : une erreur inattendue ne doit jamais faire échouer la mission.
        try:
            cfg = AI_SETTINGS.get()
            if cfg is None and not self._env_enabled:
                return None
            if cfg is not None and not cfg.enabled:
                return None
            async with self._sem:
                if cfg is not None and cfg.kind == "openai-compatible":
                    # Analyse en volume : modèle rapide du fournisseur s'il est défini.
                    out = await run_chat_completion(
                        cfg, "crm-lead-analysis", payload, ANALYSIS_SCHEMA, fast=True, timeout_ms=self._timeout_ms
                    )
                else:
                    out = await run_skill(
                        "crm-lead-analysis",
                        payload,
                        ANALYSIS_SCHEMA,
                        model=self._model,
                        timeout_ms=self._timeout_ms,
                        claude_bin=self._bin,
                        oauth_token=cfg.api_key if cfg is not None else None,
                    )
        except Exception:  # noqa: BLE001
            logger.exception("Analyse IA impossible pour %s — repli heuristique", place.get("name"))
            return None
        if not out:
            return None
        # Garde-fou : l'email retenu doit provenir des candidats réellement trouvés.
        best = (out.get("best_email") or "").strip().lower() or None
        from .email_extractor import _is_junk  # import local : évite un cycle au chargement

        out["best_email"] = best if best in {e.lower() for e in emails} and not _is_junk(best) else None
        # Téléphones et email du décideur : uniquement des valeurs réellement trouvées sur le site.
        from .contacts import normalize_fr_phone

        known_phones = {normalize_fr_phone(p) for p in phones or []} - {None}

        def known_phone(v: object) -> str | None:
            n = normalize_fr_phone(str(v or ""))
            return v if n and n in known_phones else None  # type: ignore[return-value]

        out["best_phone"] = known_phone(out.get("best_phone"))
        dm = out.get("decision_maker")
        if isinstance(dm, dict):
            dm_email = (dm.get("email") or "").strip().lower() or None
            dm["email"] = dm_email if dm_email in {e.lower() for e in emails} and not _is_junk(dm_email) else None
            dm["phone"] = known_phone(dm.get("phone"))
        out["fit_score"] = max(0, min(100, int(out.get("fit_score") or 0)))
        return out
