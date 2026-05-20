# Architecture technique — CRM Lead Dashboard

> Synthèse opérationnelle. Référence complète : `Annexe Architecture Technique CRM v5`.
> **Écart assumé vs annexe** : pas de Redis dans cette implémentation (le client n'y a pas accès) — la file de tâches asynchrones est portée par MongoDB.

## Vue d'ensemble

Application **Next.js 15 full-stack** (UI Ant Design + API Route Handlers) + un process **worker Node.js** pour les traitements asynchrones. **MongoDB 7** stocke les données métier **et** la file **@hokify/agenda** (collection configurable, défaut `crmAgendaJobs`). Le tout orchestré par **Docker Compose** derrière **Nginx**.

```
Navigateur ──► Nginx (SSL/proxy) ──► Next.js ──► Prisma ──► MongoDB
                                       │                       ▲
                                       └─ Agenda.schedule ─────┘
                                                                │ @hokify/agenda
                                              Worker Node.js ◄───┘  ──► SMTP / IMAP / APIs
```

> Le service **scraper** (Python · Playwright · rq) est prévu mais hors du périmètre courant.

## Services (docker-compose)

| Service | Techno | Rôle |
|---|---|---|
| `nextjs` | Next.js 15 + TS + Ant Design 5 + Prisma | UI + API + auth + business logic + OpenAPI |
| `worker` | Node.js 20 + Prisma + @hokify/agenda | Consomme la collection Agenda : envoi emails, import async, scoring, notifications… |
| `mongo` | MongoDB 7 (replica set 1 nœud) | Stockage principal + collection Agenda (`crmAgendaJobs` par défaut), dump quotidien |
| `nginx` | Nginx Alpine | Reverse proxy, SSL, compression, rate limit |

## File de tâches sans Redis (@hokify/agenda)

- Collection MongoDB dédiée (défaut **`crmAgendaJobs`**, surcharge `AGENDA_COLLECTION`) : schéma interne Agenda (`nextRunAt`, verrous, `failCount`, etc.).
- Côté app : `enqueue(type, payload, opts)` (`apps/web/lib/jobs.ts`) planifie via `@crm/queue` **sans** lancer le processeur Agenda sur Next.js.
- Côté worker (`apps/worker`) : `Agenda.start()` avec les mêmes handlers (`apps/worker/src/handlers`). Fréquence de scan : `WORKER_POLL_INTERVAL_MS`, concurrence : `WORKER_CONCURRENCY`.
- Fuseau horaire : `AGENDA_TIMEZONE` (env) ou document Prisma **`workerConfig`** (`agendaTimezone`), appliqué au processus worker via `process.env.TZ` ; l’UI Administration permet de choisir le fuseau (redémarrage worker requis).
- L’ancienne collection Prisma `jobs` peut subsister pour l’historique ; les nouveaux travaux passent par Agenda.

## Monorepo

```
apps/web      → Next.js (front + API)         @crm/web
apps/worker   → worker (Agenda)               @crm/worker
packages/db   → schéma Prisma + client        @crm/db   (importé par web et worker)
packages/queue → @hokify/agenda + helpers     @crm/queue (importé par web et worker)
```

Gestion : **Yarn 1 (classic) workspaces**. Build : `yarn build` (= `yarn workspaces run build`).

## Sécurité (résumé)

- **Auth** (`apps/web/lib/auth.ts`) : JWT custom (`jsonwebtoken`) + bcrypt (cost 12) + TOTP (`otplib`). Cookies `HttpOnly` `SameSite=Strict` : `crm_at` (access, court) et `crm_rt` (refresh, long, porte `tokenVersion` → logout forcé). Endpoints : `POST /api/auth/login|logout|refresh`, `GET /api/auth/me`.
- **RBAC** (`apps/web/lib/rbac.ts`) : 4 rôles (Admin / Manager / Commercial / Lecteur) → matrice de permissions. `middleware.ts` (présence du cookie) + `requirePermission()` / `requireRole()` dans chaque Route Handler (vérification crypto + RBAC fin côté serveur, le runtime Edge du middleware ne pouvant pas vérifier le JWT).
- **PII** (`apps/web/lib/crypto.ts`) : email + téléphone des **prospects** + credentials SMTP/IMAP + secret TOTP chiffrés **AES-256-GCM** (format `iv ‖ tag ‖ ciphertext`). `emailHash` = HMAC-SHA256 pour la recherche / le dédoublonnage. (Le mot de passe des **utilisateurs internes** est un hash bcrypt — pas de double chiffrement.)
- **Audit** (`apps/web/lib/audit.ts`) : collection `auditLogs` + `leadHistory` (qui / quoi / quand / IP), TTL 12 mois (index Mongo manuel).
- **RGPD** : droit à l'oubli (hard delete transactionnel multi-collection — CRM-072), export JSON/CSV, blacklist globale, désabonnement RFC 8058 (modules à venir).

## Base de données

Prisma `provider = "mongodb"`. ~25 collections (voir `packages/db/prisma/schema.prisma`, dont `jobs`). Index TTL / text / partiels non gérés par Prisma : `packages/db/prisma/manual-indexes.md`. Seed (`packages/db/prisma/seed.mjs`) : un Admin + les étapes de pipeline par défaut.

## API

Route Handlers sous `apps/web/app/api/*`. Documentation OpenAPI 3.1 générée depuis les schémas Zod (`apps/web/lib/openapi.ts`), exposée en JSON sur `/api/openapi.json` (Admin) et via Swagger UI sur `/api/docs` (connecté). Socle décrit : Auth + Leads ; enrichi au fil des modules.

## Décision T-01 (dérogation actée)

Le CDC prévoyait PostgreSQL + SPA React/Vue + Node/Python. Le client a retenu : **MongoDB 7 + Next.js 15 + Ant Design 5 + Prisma 5 + Docker** (et, dans cette implémentation, **pas de Redis** — file `jobs` portée par Mongo). Conséquences : pas de full-text PostgreSQL natif (→ MongoDB text indexes / Atlas Search), pas de transactions ACID multi-table strictes (transactions MongoDB multi-document acceptables), chiffrement applicatif uniquement (pas de pgcrypto), pas de file de messages dédiée.
