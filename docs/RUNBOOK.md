# Runbook — exploitation CRM Lead Dashboard

## Démarrage local

```bash
nvm use && yarn install       # Yarn 1.x (npm i -g yarn si absent)
cp .env.example .env          # un seul .env à la racine ; compléter AUTH_JWT_SECRET, PII_ENCRYPTION_KEY, EMAIL_HASH_SECRET…
docker compose up -d mongo    # MongoDB seul (replica set auto-initialisé par le healthcheck)
yarn db:generate && yarn db:push
# index manuels (TTL / text / partiels) — voir packages/db/prisma/manual-indexes.md
yarn db:seed                  # crée un Admin (admin@crm.local / ChangeMe!2026) + étapes pipeline
yarn dev                      # web  → http://localhost:3000
yarn worker                   # worker (autre terminal) — poll de la collection `jobs`
```

> Les commandes `yarn dev`/`worker`/`db:*` chargent le `.env` racine via `dotenv-cli`. En conteneurs, c'est `env_file: .env` (docker-compose) qui injecte les variables.

Stack complet en conteneurs : `docker compose up --build` (Nginx sur :80). Pas de service Redis.

## Génération de secrets

```bash
openssl rand -base64 48   # AUTH_JWT_SECRET
openssl rand -hex 32      # PII_ENCRYPTION_KEY  (exactement 64 caractères hex)
openssl rand -base64 32   # EMAIL_HASH_SECRET
```

## Santé / monitoring

- `GET /api/health` → `{ status: "ok", db: "ok" }` (200) ; `degraded` + 503 si Mongo down.
- Logs : `docker compose logs -f nextjs worker`.
- Mongo : `docker compose exec mongo mongosh` puis `rs.status()`.
- File de jobs : `db.jobs.find({status:'FAILED'})` / `db.jobs.countDocuments({status:'PENDING'})`.

## Sauvegardes

- `mongodump` quotidien (cron sur l'hôte / VPS).
- **Avant toute migration / Go-Live** : `mongodump` + plan de rollback documenté (CRM-079).

## Incidents fréquents

| Symptôme | Piste |
|---|---|
| L'app refuse de démarrer (`Configuration d'environnement invalide`) | Une variable critique manque/est mal formée — voir le message ; `PII_ENCRYPTION_KEY` doit faire 64 caractères hex. |
| Prisma `Transactions are not supported` | Replica set Mongo non initialisé → `rs.status()` / vérifier le healthcheck `mongo`. |
| Jobs jamais traités | Le worker tourne-t-il (`yarn worker` / conteneur `worker`) ? Voir `db.jobs` (status, lastError). |
| Connexion impossible alors que les identifiants sont bons | `2FA` activé sur le compte → fournir le code TOTP ; ou compte `isActive=false`. |
| Recherche leads lente | Text index `leads` manquant → re-`yarn db:push` + `db.leads.getIndexes()`. |
| Emails non envoyés | DNS SPF/DKIM/DMARC non propagés (CRM-028) ; quota SMTP atteint (`smtpConfigs.sentToday`). |

## Déploiement (à compléter — CRM-078 / CRM-079)

1. `docker compose build` → registry privé.
2. Déploiement pré-prod, checklist, smoke tests automatisés (auth / CRUD lead / email test).
3. Recette PO → PV signé.
4. Backup pré-migration → Go Live → monitoring renforcé H+24 → astreinte 1re semaine.
