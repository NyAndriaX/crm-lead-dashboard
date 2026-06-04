# Runbook — exploitation CRM Lead Dashboard

## Démarrage local

```bash
nvm use && yarn install       # Yarn 1.x (npm i -g yarn si absent)
cp .env.example .env          # un seul .env à la racine ; compléter AUTH_JWT_SECRET, PII_ENCRYPTION_KEY, EMAIL_HASH_SECRET…
# MySQL/MariaDB accessible via DATABASE_URL (.env)
yarn db:generate && yarn db:push
# index manuels (TTL / text / partiels) — voir packages/db/prisma/manual-indexes.md
yarn db:seed                  # crée un Admin (admin@crm.local / ChangeMe!2026) + étapes pipeline
yarn dev                      # web  → http://localhost:3000
yarn worker                   # worker (autre terminal) — @hokify/agenda (collection crmAgendaJobs par défaut)
```

> Les commandes `yarn dev`/`worker`/`db:*` chargent le `.env` racine via `dotenv-cli`. En Docker : `docker run --env-file .env`.

**Prod** : `docker build -f apps/web/Dockerfile -t crm-app .` puis `docker run --env-file .env -p 3000:3000 crm-app` — voir [PRODUCTION.md](PRODUCTION.md).

## Génération de secrets

```bash
openssl rand -base64 48   # AUTH_JWT_SECRET
openssl rand -hex 32      # PII_ENCRYPTION_KEY  (exactement 64 caractères hex)
openssl rand -base64 32   # EMAIL_HASH_SECRET
```

## Santé / monitoring

- `GET /api/health` → `{ status: "ok", db: "ok" }` (200) ; `degraded` + 503 si la base est injoignable.
- Logs conteneur : `docker logs -f crm` (nom du conteneur selon votre déploiement).
- File Agenda : collection MongoDB `crmAgendaJobs` (ou `AGENDA_COLLECTION`) — jobs `campaign-send`, `imap-sync`, etc.

## Sauvegardes

- Sauvegarde MySQL quotidienne (`mysqldump` ou outil hébergeur).
- **Avant toute migration / Go-Live** : backup base + plan de rollback documenté (CRM-079).

## Incidents fréquents

| Symptôme | Piste |
|---|---|
| L'app refuse de démarrer (`Configuration d'environnement invalide`) | Une variable critique manque/est mal formée — voir le message ; `PII_ENCRYPTION_KEY` doit faire 64 caractères hex. |
| Prisma `database_unavailable` | MySQL injoignable ou `DATABASE_URL` incorrect depuis le conteneur (utiliser l'hôte réseau Docker, pas `localhost` si la DB est sur l'hôte). |
| Jobs jamais traités | Le worker tourne-t-il (`yarn worker` / conteneur `worker`) ? Voir `db.crmAgendaJobs` (`nextRunAt`, `failReason`, `lockedAt`). |
| Connexion impossible alors que les identifiants sont bons | `2FA` activé sur le compte → fournir le code TOTP ; ou compte `isActive=false`. |
| Recherche leads lente | Text index `leads` manquant → re-`yarn db:push` + `db.leads.getIndexes()`. |
| Emails non envoyés | DNS SPF/DKIM/DMARC non propagés (CRM-028) ; quota SMTP atteint (`smtpConfigs.sentToday`). |

## Déploiement (à compléter — CRM-078 / CRM-079)

1. `docker build -f apps/web/Dockerfile -t crm-app .` → push vers registry privé.
2. Déploiement pré-prod, checklist, smoke tests automatisés (auth / CRUD lead / email test).
3. Recette PO → PV signé.
4. Backup pré-migration → Go Live → monitoring renforcé H+24 → astreinte 1re semaine.
