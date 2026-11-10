# CRM Lead

Plateforme de prospection B2B : collecte de leads (scraping Google Maps), qualification et scoring,
campagnes et séquences d'emails, boîte de réception des réponses, le tout assisté par l'**IA**.
Le fournisseur d'IA est choisi par l'administrateur : **Claude** (Claude Skills, par défaut), **OpenAI**,
**DeepSeek**, **Mistral**, **Gemini**, **Ollama** (local) ou tout service compatible OpenAI.
Monorepo **pnpm + Turborepo**, base **MySQL 8**, déployable sur **un seul serveur**.

```
                    ┌──────────────────────── serveur unique (Docker Compose) ────────────────────────┐
 Navigateur ──443──►│ nginx ──► web : Next.js 15 (UI Ant Design + API REST + tâches de fond) ──► MySQL 8 │
                    │                   │  @crm/jobs ── file queue_jobs (SKIP LOCKED)                  │
                    │                   ├──HTTP──► scraper : FastAPI + Playwright (Google Maps)        │
                    │                   └──IA──► Claude Skills (CLI) ou API compatible OpenAI          │
                    └──────────────────────────────────────────────────────────────────────────────────┘
```

## Stack

| Couche | Techno |
|---|---|
| Application (UI + API) | Next.js 15 (App Router, TypeScript strict) · Ant Design 5 · Zod · OpenAPI 3.1 |
| Tâches de fond | `@crm/jobs` démarré dans le serveur Next.js (`instrumentation.ts`) · file `@crm/queue` sur MySQL |
| Base de données | MySQL 8.4 · Prisma 5 (migrations versionnées) |
| Scraper | Python 3.12 · FastAPI · Playwright (Chromium) |
| IA | Fournisseur au choix de l'administrateur : Claude Skills (CLI Claude Code, sans clé API) ou API Chat Completions (OpenAI, DeepSeek, Mistral, Gemini, Ollama…) — mêmes skills `.claude/skills` pour tous |
| Tests | `node --test` (TypeScript), pytest (scraper), Playwright (E2E) |
| Sécurité | JWT + bcrypt + TOTP · RBAC 4 rôles · AES-256-GCM sur les PII · HMAC pour le dédoublonnage |
| Déploiement | Docker Compose : nginx (TLS Let's Encrypt) + web + scraper + MySQL |
| Monorepo | pnpm workspaces + Turborepo |

## Structure

```
crm-lead/
├── apps/
│   ├── web/          # @crm/web — Next.js : pages (auth)/(dashboard), API app/api/*, instrumentation.ts
│   └── scraper/      # @crm/scraper — FastAPI + Playwright (Python), POST /scrape
├── packages/
│   ├── db/           # @crm/db — schéma Prisma MySQL, migrations, client partagé, seed
│   ├── queue/        # @crm/queue — file de tâches MySQL (enqueue, récurrents, SKIP LOCKED)
│   ├── jobs/         # @crm/jobs — handlers : campagnes, IMAP, séquences, scraping, imports, scoring
│   └── ai/           # @crm/ai — exécution des tâches IA avec le fournisseur actif (JSON Schema, timeout, concurrence)
├── .claude/skills/   # 7 skills : plan de mission, analyse d'établissement, brief, personnalisation, variantes, tri des réponses, réponse auto
├── deploy/           # docker-compose de production, nginx, scripts (bootstrap, TLS, deploy, backup)
├── docs/             # ARCHITECTURE, ENV, RUNBOOK, BACKLOG
├── CLAUDE.md         # guide pour Claude Code
└── AGENTS.md         # démarrage rapide pour agents IA
```

## Démarrage (développement)

```bash
# Prérequis : Node 20+, pnpm 9 (corepack enable), Docker, Python 3.12 (scraper)
pnpm install
cp .env.example .env            # compléter les secrets (voir docs/ENV.md)

pnpm db:up                      # MySQL 8.4 en conteneur (crm/crm, port 3307)
pnpm db:deploy                  # applique les migrations Prisma
pnpm db:seed                    # données de démo — admin@crm.local / ChangeMe!2026

pnpm dev                        # web + tâches de fond → http://localhost:3000
pnpm --filter @crm/scraper setup && pnpm dev:full   # + scraper sur :8000
```

## Scripts

| Commande | Effet |
|---|---|
| `pnpm dev` / `pnpm dev:full` | Web (avec tâches de fond) / web + scraper |
| `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` | Turborepo sur tous les workspaces (tests unitaires TS + pytest) |
| `pnpm --filter @crm/web test:e2e` | Tests de bout en bout Playwright (application démarrée + `pnpm db:seed`) |
| `pnpm db:migrate` | Nouvelle migration après modification du schéma |
| `pnpm db:deploy` · `pnpm db:seed` · `pnpm db:studio` | Migrations · données de démo · Prisma Studio |
| `pnpm jobs` | Tâches de fond dans un process dédié (avec `RUN_JOBS=false` côté web) |
| `pnpm deploy` | Déploiement sur le serveur (`DEPLOY_HOST=user@ip`) — voir [deploy/README.md](deploy/README.md) |

## Intelligence artificielle

Configuration › Intelligence artificielle (rôle ADMIN) : choix du fournisseur, clé d'API (stockée chiffrée),
modèle de rédaction et modèle rapide, bouton « Tester la connexion ». Chaque tâche IA est décrite une seule fois
dans `.claude/skills/<tâche>/SKILL.md` ; avec Claude, le CLI Claude Code exécute le skill, avec les autres
fournisseurs le même fichier sert d'instructions à l'API Chat Completions. Sortie validée par JSON Schema,
repli déterministe si l'IA est indisponible. Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#intelligence-artificielle).

## Tests

```bash
pnpm test                                   # unitaires : @crm/ai, @crm/db, @crm/jobs (node --test) + scraper (pytest)
pnpm dev                                    # dans un autre terminal, avec la base de démo
E2E_CHROME_PATH=/usr/bin/google-chrome pnpm --filter @crm/web test:e2e   # 9 parcours Playwright
```

## Déploiement

Un seul serveur Ubuntu avec Docker : voir **[deploy/README.md](deploy/README.md)**
(préparation du VPS, certificat TLS, premier lancement, mises à jour, sauvegardes).

## Workflow Git

```
feat/CRM-XXX-...  ──MR──►  develop  ──MR──►  main (production)
```

- Une branche par ticket depuis `develop`, MR avec CI verte et revue obligatoires.
- Commits : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`…).
- UI : strictement Ant Design 5.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture technique
- [docs/ENV.md](docs/ENV.md) — variables d'environnement
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — exploitation et incidents
- [deploy/README.md](deploy/README.md) — mise en production
- API : Swagger UI sur `/api/docs` (connecté)
