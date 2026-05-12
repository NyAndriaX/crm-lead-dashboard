# CRM Lead Dashboard

Application full-stack de gestion, qualification et prospection de leads.

**Périmètre actuel : site web + dashboard.** Le service de scraping (Python) et l'enrichissement OSINT/API sont planifiés dans une phase ultérieure.

## Stack

| Couche | Techno |
|---|---|
| Frontend + API | Next.js 15 (App Router, TS strict) |
| UI | Ant Design 5 + `@ant-design/charts` + `@ant-design/icons` |
| ORM / BDD | Prisma 5 (provider `mongodb`) · MongoDB 7 (replica set 1 nœud) |
| File de tâches | Collection MongoDB `jobs` + worker en polling (**pas de Redis**) |
| Workers | Node.js 20 (process séparé) |
| Reverse proxy | Nginx |
| Orchestration | Docker Compose |
| Monorepo | Yarn 1 (classic) workspaces |

## Structure du monorepo

```
crm-lead-dashboard/
├── apps/
│   ├── web/        # Next.js 15 — UI (dashboard Ant Design) + API Route Handlers
│   │   ├── app/        # pages (auth)/(dashboard) + app/api/* (Route Handlers)
│   │   ├── lib/        # auth, crypto, rbac, api, jobs, openapi, services, schemas (Zod)
│   │   └── middleware.ts
│   └── worker/     # Worker Node.js — consomme la collection `jobs` (polling), pas de Redis
├── packages/
│   └── db/         # Schéma Prisma (~25 collections) + client partagé (@crm/db) + seed
├── docker/         # Config Nginx
├── docs/           # ARCHITECTURE.md, ENV.md, RUNBOOK.md, BACKLOG.md
├── docker-compose.yml
├── .gitlab-ci.yml
└── package.json          # champ "workspaces"
```

> `apps/scraper/` (Python · Playwright · rq) sera ajouté plus tard.

## Démarrage rapide (dev)

```bash
# 1. Pré-requis : Node 20+, Yarn 1.x (npm i -g yarn), Docker
nvm use            # lit .nvmrc
yarn install

# 2. Variables d'environnement (un seul .env à la racine — chargé via dotenv-cli)
cp .env.example .env   # puis compléter les secrets (voir docs/ENV.md)

# 3. Base de données (MongoDB seul ; replica set auto-initialisé par le healthcheck)
docker compose up -d mongo
yarn db:generate
yarn db:push
yarn db:seed                    # Admin: admin@crm.local / ChangeMe!2026 + étapes pipeline

# 4. App web (http://localhost:3000)
yarn dev

# 5. Worker (autre terminal) — traite la file `jobs`
yarn worker
```

Ou tout en conteneurs : `docker compose up --build` (Nginx sur :80). Pas de Redis.

## Scripts racine

| Commande | Effet |
|---|---|
| `yarn dev` | Lance `apps/web` en mode dev |
| `yarn worker` | Lance `apps/worker` en mode dev |
| `yarn build` | Build de tous les workspaces (ordre topologique) |
| `yarn lint` / `yarn typecheck` | Qualité sur tout le monorepo |
| `yarn db:generate` / `yarn db:push` | Prisma client / sync schéma |
| `yarn db:seed` | Seed (Admin + étapes pipeline) |
| `yarn db:studio` | Prisma Studio |

## État d'avancement

Implémenté (lots **L0 + L1**) : monorepo + CI + Docker Compose · schéma Prisma (~25 collections) · `lib/crypto` AES-256-GCM + HMAC · auth JWT + bcrypt + TOTP (`/api/auth/*`) · RBAC (matrice + `middleware.ts` + `requirePermission`) · OpenAPI 3.1 + Swagger UI (`/api/docs`) · CRUD Leads (`/api/leads`, pagination/tri/filtres/recherche, soft delete + restore) · shell dashboard Ant Design + page Leads branchée · worker (file `jobs` MongoDB en polling, sans Redis).

À venir : voir [docs/BACKLOG.md](docs/BACKLOG.md) (lots L2 → L10).

## Conventions

- Branches : `feat/CRM-XXX-courte-description`, `fix/CRM-XXX-...`
- Commits : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`…)
- 1 ticket Jira/GitLab = 1 Merge Request, CI verte obligatoire avant merge sur `main`
- UI : **strictement Ant Design 5** (pas de Tailwind / shadcn / autre lib hors charts)

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture technique
- [docs/ENV.md](docs/ENV.md) — variables d'environnement
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — exploitation, incidents, sauvegardes
- API : Swagger UI sur `/api/docs` (auth Admin) une fois l'app lancée
