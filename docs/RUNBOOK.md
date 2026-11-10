# Runbook — exploitation CRM Lead

Commandes de production à lancer depuis `/opt/crm-lead` sur le serveur. Alias pratique :

```bash
alias dc='docker compose -f deploy/docker-compose.yml --env-file deploy/.env'
```

## Démarrage local

```bash
pnpm install && cp .env.example .env     # compléter les secrets
pnpm db:up && pnpm db:deploy && pnpm db:seed
pnpm dev                                 # web + tâches de fond → http://localhost:3000
```

## Santé / monitoring

- `GET /api/health` → `{ status: "ok", checks: { db, worker } }` (200) ; `degraded` + 503 si MySQL est
  injoignable ou si aucun job n'a abouti depuis 15 min (tâches de fond arrêtées). À brancher sur une
  sonde externe (Uptime Robot, Better Uptime…).
- Logs : `dc logs -f web` (préfixes `[jobs]`, `[queue]`, `[ai]`, `[imap-sync]`…), `dc logs -f scraper`.
- État de la file :

```sql
-- dc exec mysql sh -c 'mysql -ucrm -p"$MYSQL_PASSWORD" crm'
SELECT name, status, COUNT(*) FROM queue_jobs GROUP BY name, status;
SELECT name, runAt, attempts, LEFT(lastError, 200) FROM queue_jobs WHERE status = 'FAILED' ORDER BY updatedAt DESC LIMIT 20;
-- Relancer un job échoué :
UPDATE queue_jobs SET status = 'PENDING', runAt = NOW(3), attempts = 0 WHERE id = '<id>';
```

## Sauvegardes

- `deploy/scripts/backup.sh` (cron quotidien) : `mysqldump --single-transaction`, rotation 14 jours.
- Copier régulièrement `deploy/backups/` hors du serveur, et conserver `PII_ENCRYPTION_KEY` dans un coffre.
- Restauration : voir l'en-tête de `backup.sh`.

## Incidents fréquents

| Symptôme | Piste |
|---|---|
| Le web redémarre en boucle (`Configuration d'environnement invalide`) | Variable critique absente ou mal formée dans `deploy/.env` — `PII_ENCRYPTION_KEY` = 64 caractères hex. |
| Web en `500`, logs `Prisma Client could not locate the Query Engine` | Image construite sans le moteur natif : vérifier dans `apps/web/Dockerfile` la copie de `/prisma-client` vers `apps/web/.prisma/client`, puis `dc build web && dc up -d web`. |
| `deploy/scripts/*.sh` : `.env: line N: … command not found` | Valeur avec espaces non quotée dans `deploy/.env` (ex. `SMTP_FROM_NAME="CRM Lead"`). |
| Service `migrate` en erreur | `dc logs migrate` : migration incompatible ou MySQL indisponible ; `ADMIN_EMAIL`/`ADMIN_PASSWORD` (≥ 10 car.) requis. |
| Jobs jamais traités | `RUN_JOBS` ≠ `false` ? Logs `[jobs]` au démarrage du web ? Requête SQL sur `queue_jobs` ci-dessus. |
| Job bloqué en `RUNNING` | Repris automatiquement à l'expiration de `lockedUntil` (durées dans `packages/jobs/src/start.ts`). |
| Connexion refusée avec de bons identifiants | 2FA activée → code TOTP ; compte `isActive = false` ; rate-limit nginx (10 req/min sur `/api/auth/`). |
| Brief / personnalisation IA absents (`source: "fallback"`) | Configuration › Intelligence artificielle : IA activée ? « Tester la connexion » affiche l'erreur du fournisseur (clé invalide `HTTP 401`, quota, modèle inconnu). Claude : jeton `CLAUDE_CODE_OAUTH_TOKEN` valide (`claude setup-token`). Logs `[ai] <tâche> via <fournisseur> KO`. |
| Fournisseur IA externe injoignable depuis le serveur | Vérifier l'accès sortant HTTPS vers l'API (pare-feu) ; avec Ollama, le point d'accès doit être joignable depuis les conteneurs web **et** scraper (IP de l'hôte, ex. `http://172.17.0.1:11434/v1`, ou service Compose — `localhost` désigne le conteneur). |
| Page Prospection : « Scraper hors ligne » | `dc ps scraper` / `dc logs scraper` ; en dev : `cd apps/scraper && .venv/bin/uvicorn app.main:app --port 8000`. |
| `pnpm dev` boucle sur `Watchpack Error … EMFILE` | Limite d'instances inotify atteinte (éditeurs, autres watchers) : lancer `WATCHPACK_POLLING=true pnpm dev`, ou relever `fs.inotify.max_user_instances` (sudo). |
| Scraping en erreur | `dc logs scraper` ; `SCRAPER_API_KEY` identique côté web et scraper ; mémoire suffisante pour Chromium. |
| Emails non envoyés | DNS SPF/DKIM/DMARC (CRM-028) ; quota SMTP atteint (`smtpConfigs.sentToday`). |
| Certificat expiré | `dc logs certbot` ; `dc restart nginx`. |

## Mise à jour

Depuis le poste de développement : `DEPLOY_HOST=user@ip pnpm deploy` (voir `deploy/README.md`).
Retour arrière : redéployer le commit précédent ; si une migration doit être annulée, restaurer la
sauvegarde prise juste avant le déploiement.
