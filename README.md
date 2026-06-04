# CRM Lead Dashboard

Application full-stack de gestion, qualification et prospection de leads.

**Périmètre actuel : site web + dashboard.** Le service de scraping (Python) et l'enrichissement OSINT/API sont planifiés dans une phase ultérieure.

## Stack

| Couche | Techno |
|---|---|
| Frontend + API | Next.js 15 (App Router, TS strict) |
| UI | Ant Design 5 + `@ant-design/charts` + `@ant-design/icons` |
| ORM / BDD | Prisma 5 (provider `mongodb`) · MongoDB 7 (replica set 1 nœud) |
| File de tâches | **@hokify/agenda** sur MongoDB (collection `crmAgendaJobs` par défaut) — **pas de Redis** |
| Workers | Node.js 20 (process séparé) |
| Reverse proxy | Nginx |
| Déploiement | Docker (un Dockerfile : web + worker) |
| Monorepo | Yarn 1 (classic) workspaces |

## Structure du monorepo

```
crm-lead-dashboard/
├── apps/
│   ├── web/        # Next.js 15 — UI (dashboard Ant Design) + API Route Handlers
│   │   ├── app/        # pages (auth)/(dashboard) + app/api/* (Route Handlers)
│   │   ├── lib/        # auth, crypto, rbac, api, jobs, openapi, services, schemas (Zod)
│   │   └── middleware.ts
│   └── worker/     # Worker Node.js — @hokify/agenda (MongoDB), pas de Redis
├── packages/
│   └── db/         # Schéma Prisma (~25 collections) + client partagé (@crm/db) + seed
├── Dockerfile              # = docker/Dockerfile.app (web + worker)
├── apps/web/Dockerfile     # image web + worker (au choix pour le deploy)
├── apps/worker/Dockerfile  # identique à apps/web/Dockerfile
├── docker/         # Dockerfile.app (référence) + config Nginx
├── docs/           # ARCHITECTURE.md, ENV.md, PRODUCTION.md, RUNBOOK.md, BACKLOG.md
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

# 3. Base de données (MySQL/MariaDB — DATABASE_URL dans .env)
yarn db:generate
yarn db:push
yarn db:seed                    # Admin: admin@crm.local / ChangeMe!2026 + étapes pipeline

# 4. App web (http://localhost:3000)
yarn dev

# 5. Worker (autre terminal) — traite la file Agenda (`crmAgendaJobs`)
yarn worker
```

**Prod Docker** (un domaine, un conteneur — choisir **un** Dockerfile, même image) :

```bash
docker build -f apps/web/Dockerfile -t crm-app .
docker run -d --name crm --env-file .env -p 3000:3000 --restart unless-stopped crm-app
```

Voir [docs/PRODUCTION.md](docs/PRODUCTION.md). `apps/worker/Dockerfile` et `Dockerfile` à la racine sont équivalents.

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

- **L0 + L1** (socle) : monorepo + CI + image Docker (web+worker) · schéma Prisma (~25 collections) · `lib/crypto` AES-256-GCM + HMAC · auth JWT + bcrypt + TOTP (`/api/auth/*`) · RBAC (matrice + `middleware.ts` + `requirePermission`) · OpenAPI 3.1 + Swagger UI (`/api/docs`) · CRUD Leads · shell dashboard Ant Design · worker (**@hokify/agenda** sur MongoDB, sans Redis).
- **L2** (Leads avancé — en cours) : fiche lead détaillée (Descriptions + Timeline) · filtres avancés multi-critères + recherche · workflow de statuts (transitions validées) · tags + référentiel · assignation + notification in-app · vues sauvegardées · export CSV/XLSX · lead scoring 0–100 (recalcul auto + job batch).

Détail et reste à faire : [docs/BACKLOG.md](docs/BACKLOG.md) (lots L2 → L10).

## Workflow Git

Modèle de branches (type Git Flow simplifié) :

```
feat/CRM-XXX-...  ──MR──►  develop  ──MR──►  main
fix/CRM-XXX-...   ──MR──►  develop          (= production / release)
```

- **`main`** : branche de production, protégée. On n'y arrive **que** via une MR depuis `develop`.
- **`develop`** : branche d'intégration, **branche par défaut du projet GitLab** (cible par défaut des MR). Protégée.
- **`feat/CRM-XXX-courte-description`** / **`fix/CRM-XXX-...`** : une branche par ticket, créée **depuis `develop`**, mergée dans `develop` via MR (CI verte + revue obligatoires).

```bash
git checkout develop && git pull
git checkout -b feat/CRM-011-fiche-lead
# … commits …
git push -u origin feat/CRM-011-fiche-lead   # puis ouvrir la MR vers develop
```

- Commits : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`…).
- 1 ticket = 1 MR ; le template de MR du repo référence le ticket et liste la checklist.
- UI : **strictement Ant Design 5** (pas de Tailwind / shadcn / autre lib hors charts).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture technique
- [docs/ENV.md](docs/ENV.md) — variables d'environnement
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — exploitation, incidents, sauvegardes
- API : Swagger UI sur `/api/docs` (auth Admin) une fois l'app lancée
