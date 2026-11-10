# CLAUDE.md

Guide pour Claude Code (claude.ai/code) dans ce dépôt.

## Vue d'ensemble

CRM Lead — prospection B2B (scraping Google Maps → qualification → campagnes/séquences email →
inbox des réponses), assistée par l'IA — fournisseur choisi par l'administrateur (Claude Skills par défaut,
ou OpenAI, DeepSeek, Mistral, Gemini, Ollama, service compatible OpenAI). Monorepo **pnpm + Turborepo**, **MySQL 8**,
déployé sur **un seul serveur** (Docker Compose : nginx + web + scraper + mysql).

```
apps/web        @crm/web      Next.js 15 — UI Ant Design + API (app/api/*) + tâches de fond (instrumentation.ts)
apps/scraper    @crm/scraper  FastAPI + Playwright (Python) — POST /scrape, appelé par le job scraping-run
packages/db     @crm/db       Prisma (MySQL), migrations, client partagé, helpers (leadWhere, scraping, json)
packages/queue  @crm/queue    File MySQL `queue_jobs` : enqueue / scheduleRecurring / startQueueWorker
packages/jobs   @crm/jobs     Handlers des jobs + startJobs() (démarré par apps/web/instrumentation-node.ts)
packages/ai     @crm/ai       runSkill() — exécute une tâche IA avec le fournisseur actif (CLI Claude Code ou API Chat Completions), sortie validée JSON Schema
.claude/skills  Skills IA métier (crm-*) — le SEUL endroit où vivent les prompts
deploy/         docker-compose.yml de prod, nginx, scripts bootstrap / init-ssl / deploy / backup
```

## Commandes

```bash
pnpm install
pnpm db:up && pnpm db:deploy && pnpm db:seed   # MySQL local + migrations + démo
pnpm dev                                       # http://localhost:3000 (web + tâches de fond)
pnpm dev:full                                  # + scraper :8000 (pnpm --filter @crm/scraper setup d'abord)
pnpm typecheck && pnpm lint && pnpm test
pnpm db:migrate                                # après toute modification de schema.prisma
```

## Invariants

- **Données** : tout accès base passe par le client Prisma de `@crm/db`. Identifiants `cuid()`
  (validés par `entityId` dans `apps/web/lib/schemas/common.ts`). Pas de MongoDB, pas d'`isSet`,
  pas de `mode: "insensitive"` (la collation `utf8mb4_0900_ai_ci` est déjà insensible casse/accents).
- **Listes en JSON** : `Lead.tags`, `Template.variables`, `TemplateBlock.variables`, `WebhookOut.events`
  sont des colonnes JSON obligatoires. Lire avec `asStringArray()` (`@crm/db`), filtrer avec
  `{ array_contains: [valeur] }`.
- **Schéma** : toute modification → `pnpm db:migrate` (migration versionnée commitée). Jamais de
  `db push` en production.
- **Tâches asynchrones** : `enqueue(name, payload, opts)` de `@crm/queue` (côté web : `lib/jobs.ts`).
  Un nouveau type de job = un handler dans `packages/jobs/src/handlers/index.ts` + verrou/concurrence
  dans `packages/jobs/src/start.ts`. Pas de Redis, pas d'Agenda.
- **Tâches de fond** : démarrées dans le serveur Next.js via `instrumentation.ts` → `instrumentation-node.ts`
  (le code Node ne doit jamais être importé hors de la branche `NEXT_RUNTIME === "nodejs"`).
  `RUN_JOBS=false` + `pnpm jobs` pour les isoler dans un process dédié.
- **IA** : une tâche IA = un skill `.claude/skills/<nom>/SKILL.md` (les instructions, SEUL endroit où vivent
  les prompts) + un JSON Schema dans `packages/ai/src/schemas.ts` + `runSkill()`. Le fournisseur est choisi
  par l'administrateur (table `aiConfig`, Configuration › Intelligence artificielle ; catalogue
  `packages/ai/src/providers.ts`) : Claude Skills → CLI Claude Code, données passées **en argument** du skill
  (`/<skill> <json>`, jamais sur stdin), pas de choix de modèle exposé ; autres fournisseurs → API Chat Completions
  avec le même SKILL.md (`openaiCompatible.ts`). Clés d'API et jeton `CLAUDE_CODE_OAUTH_TOKEN` stockés chiffrés,
  jamais renvoyés au navigateur. Le scraper reçoit le fournisseur avec chaque mission (`ScrapeRequest.ai`).
  Toujours prévoir un fallback déterministe : `runSkill` renvoie `null` en cas d'échec. Dans l'UI, parler de
  « l'IA », pas d'un fournisseur en particulier (sauf dans la Configuration).
- **PII** : emails/téléphones des prospects et identifiants SMTP/IMAP chiffrés AES-256-GCM
  (`lib/crypto.ts`), `emailHash` HMAC pour la recherche. Les coordonnées supplémentaires trouvées par le
  scraper (téléphones du site, email / ligne directe du décideur) vont dans `leads.contactsEnc` (JSON chiffré),
  jamais dans `enrichment` (réservé aux données d'entreprise publiques). Ne jamais logguer de PII en clair.
- **Auth/RBAC** : chaque Route Handler appelle `requirePermission()` ; le middleware Edge ne fait que
  vérifier la présence du cookie.
- **UI** : Ant Design 5 uniquement (pas de Tailwind / shadcn).

## Déploiement

`deploy/README.md`. Un seul serveur : `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`.
Le service `migrate` applique `prisma migrate deploy` + `init-prod` avant le démarrage du web.
Le CLI Claude Code est embarqué dans les images web et scraper (fournisseur par défaut) ; les autres fournisseurs
n'ont besoin que d'un accès réseau sortant vers leur API.

## Style

TypeScript strict, Conventional Commits, une branche `feat/CRM-XXX-…` par ticket depuis `develop`.
