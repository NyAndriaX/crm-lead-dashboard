# CRM Lead Scraper — Google Maps

API FastAPI (Playwright + `playwright-stealth`) qui scrape Google Maps, extrait les emails sur les sites web des établissements, et renvoie des leads **normalisés** pour **CRM Lead Dashboard** (`ScrapedLead`).

> Usage prévu : prospection sur données publiques. Respectez les CGU Google et le RGPD.

## Stack

- FastAPI + Uvicorn
- Playwright + Chromium
- pydantic-settings (`.env`)
- Analyse IA de chaque fiche (skill `.claude/skills/crm-lead-analysis`) avec le fournisseur choisi dans le CRM :
  CLI Claude Code (Claude Skills) ou API Chat Completions (OpenAI, DeepSeek, Mistral, Gemini, Ollama…) via `httpx`

## Installation

```bash
cd "Project 2026/CRM_LEAD_SCRAPER"
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
```

## Démarrage

```bash
./run.sh
# API : http://localhost:8000 — docs : /docs
```

## Docker

```bash
cp .env.example .env   # ou copier votre .env local
docker compose up --build -d
```

Toute la configuration passe par le fichier **`.env`** (mêmes variables qu’en local : `HEADLESS`, `LOCALE`, `NAV_TIMEOUT_MS`, `DEFAULT_MAX_RESULTS`, `PROXY`). Pas de `ports` ni variables en double dans `docker-compose.yml`.

Le service écoute sur le port **8000** dans le réseau Docker — accès via reverse proxy ou nom de service `crm-lead-scraper`.

Commandes utiles :

```bash
docker compose logs -f
docker compose down
docker build -t crm-lead-scraper:latest .
docker run --rm --env-file .env crm-lead-scraper:latest
```

## Contrat API (Option A — CRM appelle le scraper)

### `POST /scrape` (recommandé)

Aligné sur `ScrapeConfig` du worker CRM (`keywords`, `location`, `limit`).

**Headers** (si `SCRAPER_API_KEY` est défini dans `.env`) :

- `Authorization: Bearer <SCRAPER_API_KEY>` **ou**
- `X-Api-Key: <SCRAPER_API_KEY>`

**Body :**

```json
{
  "keywords": "Immobilier",
  "location": { "city": null, "country": "France" },
  "limit": 20,
  "detailed": true,
  "locale": "fr-FR",
  "filter_country": true
}
```

**Réponse :**

```json
{
  "ok": true,
  "query": "Immobilier France",
  "count": 15,
  "source": "google_maps",
  "scraped_at": "2026-05-19T12:00:00Z",
  "results": [
    {
      "source": "google_maps",
      "company": "Côté France Immobilier – Agence immobilière",
      "name": null,
      "email": "contact@example.fr",
      "phone": "+33 …",
      "website": "https://…",
      "address": "…, 08170 Fumay, France",
      "city": "Fumay",
      "country": "France",
      "sector": "Agence immobilière",
      "rating": 4.7,
      "reviews": 128,
      "place_id": "ChIJ…",
      "maps_url": "https://www.google.com/maps/place/?q=place_id:ChIJ…",
      "latitude": 49.99,
      "longitude": 4.70,
      "email_status": "found",
      "query": "Immobilier France",
      "scraped_at": "2026-05-19T12:00:00Z"
    }
  ],
  "meta": {
    "duration_ms": 45000,
    "filters_applied": ["country:France"]
  }
}
```

**Erreur (502) :**

```json
{ "ok": false, "error": "Echec du scraping: …", "results": [] }
```

### `GET /scrape`

```bash
curl -G "http://localhost:8000/scrape" \
  -H "Authorization: Bearer $SCRAPER_API_KEY" \
  --data-urlencode "keywords=Immobilier" \
  --data-urlencode "country=France" \
  --data-urlencode "limit=10"
```

### `POST /search` (déprécié)

Ancien format `{ "query": "…", "max_results": 20 }` — retourne le **même JSON normalisé**.

## Mapping ancien → CRM

| Ancien (Maps) | Nouveau (`ScrapedLead`) |
|---------------|-------------------------|
| `name` | `company` |
| `category` | `sector` |
| — | `name` = `null` (contact humain uniquement) |
| `place_id` | `place_id` |
| `email_status` | `email_status` |
| — | `ai` = analyse IA de la fiche (skill `crm-lead-analysis`, si l'IA est active) |
| — | `contacts` = téléphones, réseaux sociaux, page contact, mentions légales trouvés sur le site |

## Analyse IA (`ai`)

Pour chaque établissement, le scraper envoie la fiche Maps, des extraits de la page d'accueil et des
mentions légales, les emails et téléphones trouvés au skill **`crm-lead-analysis`**
(`.claude/skills/crm-lead-analysis/SKILL.md`). Sortie validée par JSON Schema : résumé, activité,
services, décideur, meilleur email / téléphone, signaux, score d'adéquation 0-100.

Le fournisseur n'est pas configuré ici : le CRM l'envoie avec chaque mission (`ScrapeRequest.ai`,
réglé par l'administrateur dans Configuration › Intelligence artificielle) — `app/claude_skills.py` :

- **Claude Skills** : CLI Claude Code en mode headless (`claude -p '/crm-lead-analysis {…}' --output-format json
  --json-schema '{…}' --tools ""`), jeton `CLAUDE_CODE_OAUTH_TOKEN` transmis par le CRM ; `ANTHROPIC_API_KEY`
  est retiré de l'environnement du CLI ;
- **API compatible OpenAI** : `POST {base_url}/chat/completions` avec le corps du SKILL.md en instructions système.

Sans configuration reçue, `CLAUDE_SKILLS_ENABLED=true` active le CLI comme repli (développement local).
Une analyse en échec n'interrompt jamais la mission : la fiche est renvoyée sans `ai`.

## `email_status`

| Valeur | Signification |
|--------|----------------|
| `found` | Email sur la page d'accueil |
| `found_legal` | Email via mentions légales / contact |
| `no_email` | Site visité, pas d'email |
| `no_website` | Pas de site |
| `invalid_email` | Format rejeté |
| `unreachable` | Site inaccessible |
| `skipped` | `detailed: false` |

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `HEADLESS` | `true` | Navigateur sans UI |
| `LOG_LEVEL` | `INFO` | Logs de progression (`DEBUG` = détail par site) |
| `LOCALE` | `fr-FR` | Locale Playwright |
| `NAV_TIMEOUT_MS` | `30000` | Timeout Maps |
| `EMAIL_NAV_TIMEOUT_MS` | `15000` | Timeout par site |
| `EMAIL_PAGE_WAIT_MS` | `2000` | Attente après chargement |
| `EMAIL_CONCURRENCY` | `3` | Sites visités en parallèle (`detailed: true`) |
| `SCRAPER_TIMEOUT_MS` ou `SCRAPE_TIMEOUT_MS` | `630000` | Durée max d'une requête `/scrape` (0 = illimité) — **uniquement côté scraper** |
| `HOMEPAGE_ENRICHMENT` | `true` | Lit la page d'accueil et lance l'analyse IA de chaque fiche (`detailed: true`) |
| `CLAUDE_SKILLS_ENABLED` | `false` | Repli quand le CRM n'envoie pas de configuration IA : `true` = CLI Claude Code |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Jeton de repli pour le CLI (normalement transmis par le CRM avec la mission) |
| `CLAUDE_MODEL` | `haiku` | (Claude Skills, repli local) alias de modèle du CLI |
| `CLAUDE_TIMEOUT_MS` | `120000` | Timeout d'une exécution de skill |
| `CLAUDE_MAX_CONCURRENCY` | `2` | Process `claude` simultanés max |
| `CLAUDE_BIN` | `claude` | Chemin du binaire CLI |
| `SCRAPER_API_KEY` | — | Si défini, auth obligatoire sur `/scrape` et `/search` |
| `PROXY` | — | Proxy optionnel |
| `BROWSER_EXECUTABLE_PATH` | — | Navigateur du système à utiliser au lieu du Chromium Playwright (dev local, ex. `/usr/bin/google-chrome`) |

## Intégration CRM Lead Dashboard

Dans le worker (`apps/worker`), activer `SCRAPING_LIVE=true` et appeler :

```http
POST http://localhost:8000/scrape
Authorization: Bearer <SCRAPER_API_KEY>
Content-Type: application/json

{ "keywords": "…", "location": { "country": "France" }, "limit": 20, "detailed": true }
```

Le timeout global est défini dans le `.env` du scraper (`SCRAPER_TIMEOUT_MS`, ex. `630000` = 10,5 min). Le CRM peut laisser `SCRAPER_TIMEOUT_MS=0` (pas de limite HTTP) : le service Python coupe la requête et renvoie une erreur 502 si la durée est dépassée. Avec `limit=15` et `detailed: true`, prévoir **2–5 min** en conditions normales.

## Tests

```bash
pytest
```

Fixtures : `fixtures/sample_maps_raw.json`, `fixtures/sample_response_normalized.json`.

## Notes

- `detailed: true` visite chaque site (lent).
- Déduplication : `place_id` puis `(company, city)` — **pas** sur l'email seul.
- Filtre `country: France` : adresse contenant « France » ou coordonnées en bbox métropolitaine.
