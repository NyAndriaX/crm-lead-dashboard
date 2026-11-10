# Architecture technique — CRM Lead

## Vue d'ensemble

Deux services applicatifs, une base MySQL, un reverse proxy — le tout sur **un seul serveur**
orchestré par Docker Compose.

```
                 ┌─────────────────────────────── serveur unique ───────────────────────────────┐
 Navigateur ─────┤ nginx (TLS, gzip, rate-limit /api/auth)                                       │
   HTTPS         │   │                                                                          │
                 │   ▼                                                                          │
                 │ web — Next.js 15 (process Node unique)                                        │
                 │   ├─ UI Ant Design (App Router, pages (auth) / (dashboard))                    │
                 │   ├─ API REST (Route Handlers app/api/*, Zod, OpenAPI 3.1, RBAC)               │
                 │   └─ tâches de fond @crm/jobs (instrumentation.ts) ──┐                         │
                 │          │ Prisma                                    │ HTTP POST /scrape       │
                 │          ▼                                           ▼                         │
                 │ MySQL 8.4  (données métier + file queue_jobs)     scraper — FastAPI + Chromium   │
                 │                                                                                │
                 │ web, scraper ──claude -p──► Claude Skills (.claude/skills) ── abonnement Claude │
                 └────────────────────────────────────────────────────────────────────────────────┘
                     web ──SMTP/IMAP──► serveurs de messagerie (comptes configurés dans l'app)
```

| Service | Techno | Rôle |
|---|---|---|
| `nginx` | nginx 1.27 | Seul point d'entrée (80/443) : TLS Let's Encrypt, redirection HTTPS, compression, limitation de débit |
| `web` | Next.js 15 + Prisma + `@crm/jobs` | UI, API, authentification, logique métier, **et** tâches de fond (campagnes, IMAP, séquences, scraping, imports, scoring, purge RGPD) |
| `scraper` | FastAPI + Playwright | Recherche Google Maps, visite des sites, extraction d'emails, résumé IA de la page d'accueil |
| `mysql` | MySQL 8.4 | Données métier + file de tâches. Non exposé (réseau Docker interne) |
| `migrate` | image de build web | One-shot à chaque déploiement : `prisma migrate deploy` + `init-prod` |
| `certbot` | certbot | Renouvellement automatique du certificat |

## Monorepo (pnpm + Turborepo)

```
apps/web        @crm/web       Next.js — dépend de @crm/db, @crm/queue, @crm/jobs, @crm/ai
apps/scraper    @crm/scraper   Python — indépendant (contrat HTTP ScrapedLead)
packages/db     @crm/db        schéma Prisma, migrations, client, helpers partagés
packages/queue  @crm/queue     file de tâches MySQL
packages/jobs   @crm/jobs      handlers des tâches de fond + startJobs()
packages/ai     @crm/ai        exécuteur de Claude Skills
.claude/skills                 skills IA versionnés avec le code
```

Les packages sont consommés en source TypeScript (`transpilePackages` côté Next.js), sans étape de build.

## Base de données (MySQL 8 + Prisma)

- 31 tables (`packages/db/prisma/schema.prisma`), migrations versionnées dans `packages/db/prisma/migrations`.
- Identifiants `cuid()`. Collation `utf8mb4_0900_ai_ci` : recherches insensibles à la casse et aux accents.
- **Intégrité référentielle** par clés étrangères. `ON DELETE CASCADE` sur l'historique, le pipeline, les
  séquences, les emails et l'inbox d'un lead : l'effacement RGPD (`POST /api/rgpd/leads/:id/erase`) est
  garanti au niveau de la base.
- Listes (tags, variables de template, événements webhook) en colonnes JSON, filtrées par `array_contains`.
- PII chiffrées applicativement (AES-256-GCM, colonnes `BLOB` suffixées `Enc`) ; `emailHash` HMAC-SHA256
  pour le dédoublonnage.
- Rétention : job quotidien `retention-purge` (journaux d'audit et historique 12 mois, imports 90 jours).

## File de tâches (`@crm/queue`)

Table `queue_jobs`, sans Redis ni broker :

| Opération | Mécanisme |
|---|---|
| Planifier | `enqueue(name, payload, { runAt, priority, maxAttempts, uniqueKey })` → `INSERT` |
| Job récurrent | `scheduleRecurring(name, everyMs)` → `upsert` sur `uniqueKey = recurring:<nom>` |
| Réclamer | transaction `SELECT … FOR UPDATE SKIP LOCKED` puis `UPDATE status = RUNNING, lockedUntil` |
| Terminer | `DONE` (purgé après 7 j) ; récurrent → `PENDING` à `now + repeatEveryMs` |
| Échec | retry avec backoff exponentiel jusqu'à `maxAttempts`, sinon `FAILED` + `lastError` |
| Crash | un job `RUNNING` dont `lockedUntil` est dépassé redevient éligible |

`SKIP LOCKED` permet de lancer plusieurs processeurs (plusieurs instances web, ou `pnpm jobs`) sans
double exécution. Concurrence et durée de verrou par type de job : `packages/jobs/src/start.ts`.

Jobs récurrents : `imap-sync` (5 min), `sequence-tick` (1 min), `scraping-scheduler` (1 h), `retention-purge` (1 j).

## Tâches de fond dans le serveur web

`apps/web/instrumentation.ts` (hook Next.js exécuté une fois au démarrage) importe
`instrumentation-node.ts` uniquement dans le runtime Node, qui appelle `startJobs()` :
récupération des missions bloquées, déclaration des jobs récurrents, démarrage du processeur.
`RUN_JOBS=false` désactive ce démarrage pour exécuter les tâches dans un process dédié
(`pnpm jobs`) si la charge l'exige — sans changement de code.

## Scraping

1. L'utilisateur crée une mission (mots-clés, pays/ville, volume, planification) → job `scraping-run`.
2. Le job appelle `POST http://scraper:8000/scrape` (clé partagée `SCRAPER_API_KEY`).
3. Le scraper interroge Google Maps (Playwright + stealth), visite chaque site (emails, mentions
   légales, téléphones, réseaux sociaux) et analyse chaque fiche avec l'IA (skill `crm-lead-analysis`).
4. Le CRM normalise, dédoublonne (`place_id` puis email), met en tampon pour validation, puis injecte,
   enrichit et qualifie (skill `crm-lead-brief`).

## Intelligence artificielle

Chaque tâche IA est décrite **une seule fois** dans un skill versionné (`.claude/skills/<nom>/SKILL.md` :
rôle, format d'entrée, règles métier) avec un JSON Schema de sortie (`packages/ai/src/schemas.ts`).
Le **fournisseur** est choisi par l'administrateur (Configuration › Intelligence artificielle, table
`aiConfig`, catalogue `packages/ai/src/providers.ts`) ; `runSkill()` route chaque tâche :

| Fournisseur | Exécution | Modèle | Authentification |
|---|---|---|---|
| Claude (Claude Skills) — défaut | CLI Claude Code : `claude -p "/<skill> <json>" --output-format json --json-schema …` (sans outils, contexte isolé) | non exposé (fait partie du skill) | jeton `CLAUDE_CODE_OAUTH_TOKEN` (Configuration ou env) ; `ANTHROPIC_API_KEY` retiré |
| OpenAI, DeepSeek, Mistral, Gemini | API Chat Completions (`openaiCompatible.ts`) : SKILL.md en instructions système, schéma joint, mode JSON | modèle de rédaction + modèle rapide | clé d'API chiffrée (`aiConfig.apiKeyEnc`) |
| Ollama, service compatible OpenAI | idem, point d'accès configurable (modèle local possible) | idem | clé facultative |

Le scraper (Python) applique le même routage pour `crm-lead-analysis` : le job `scraping-run` lui transmet
le fournisseur actif dans la requête (`ScrapeRequest.ai`), une variable de contexte le rend disponible aux
analyses lancées en parallèle (`app/claude_skills.py`).

| Tâche (skill) | Appelant | Gabarit | Repli si indisponible |
|---|---|---|---|
| `crm-scraping-plan` | web — assistant « Nouvelle mission » | rédaction | saisie manuelle |
| `crm-lead-analysis` | scraper — chaque site visité | volume | email heuristique, pas de score |
| `crm-lead-brief` | web — après injection de leads scrapés | rédaction | brief déterministe |
| `crm-email-personalize` | jobs — `campaign-send`, `sequence-tick` | rédaction | email à variables |
| `crm-reply-categorize` | jobs — `imap-sync` ; web — re-catégorisation | volume | heuristique mots-clés |
| `crm-auto-reply` | jobs — auto-répondeur | rédaction | template |
| `crm-email-variants` | web — éditeur de templates | rédaction | erreur 503 explicite |

Garanties communes : sortie validée par JSON Schema (CLI ou validateur `matchesSchema`), timeout
(`AI_TIMEOUT_MS`), sémaphore de concurrence (`AI_MAX_CONCURRENCY`), cache de configuration de 30 s,
aucune exception remontée aux traitements métier (`null` → repli). Le bouton « Tester la connexion »
(`POST /api/admin/ai-config/test`) exécute une vraie tâche de tri et affiche fournisseur, modèle et durée.

## Sécurité

- **Auth** : JWT (cookies `HttpOnly`, `SameSite=Strict`, access 15 min + refresh 7 j avec `tokenVersion`),
  bcrypt (cost 12), TOTP optionnel.
- **RBAC** : 4 rôles (Admin, Manager, Commercial, Lecteur) ; `requirePermission()` dans chaque Route Handler.
- **PII** : AES-256-GCM (`iv ‖ tag ‖ ciphertext`), clé `PII_ENCRYPTION_KEY` hors base ; coordonnées trouvées par le
  scraper (téléphones du site, ligne directe du décideur) dans `leads.contactsEnc` ; clés d'API IA dans `aiConfig.apiKeyEnc`.
- **Audit** : `auditLogs` + `leadHistory`.
- **RGPD** : export, effacement en cascade, blacklist, désabonnement RFC 8058, rétention automatique.
- **Réseau** : seul nginx est exposé ; pare-feu UFW (22, 80, 443) ; rate-limit sur `/api/auth/`.

## Choix d'architecture

| Décision | Raison |
|---|---|
| MySQL plutôt que MongoDB | Données fortement relationnelles (leads ↔ campagnes ↔ événements ↔ séquences), intégrité par clés étrangères, effacement RGPD en cascade, transactions ACID, exploitation simple (`mysqldump`). |
| File de tâches sur MySQL | Pas de Redis à opérer sur un serveur unique ; `SKIP LOCKED` (MySQL 8) suffit au volume d'une PME. |
| Tâches de fond dans le web | Un service de moins à déployer ; séparable à tout moment (`RUN_JOBS=false`). |
| Scraper séparé | Langage (Python/Playwright) et profil de ressources (Chromium) différents : isolé pour ne pas impacter l'application. |
| Claude Skills via CLI | Prompts versionnés et relus comme du code ; pas de clé API à gérer, abonnement existant. |
