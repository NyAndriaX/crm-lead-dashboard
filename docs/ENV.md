# Variables d'environnement

Copier `.env.example` → `.env`. Ne jamais committer `.env`. En production, les secrets viennent d'un coffre (Vault / KMS) — surtout `PII_ENCRYPTION_KEY` (sa perte = perte des données chiffrées). Les valeurs sont validées au boot (`apps/web/lib/env.ts`) : l'app refuse de démarrer si une variable critique est absente ou mal formée.

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | URI MongoDB. **Replica set requis** par Prisma (`?replicaSet=rs0`). |
| `AUTH_JWT_SECRET` | ✅ | Secret de signature des JWT (access + refresh). `openssl rand -base64 48`. |
| `JWT_ACCESS_TTL` | — | Durée de vie de l'access token (s). Défaut 900 (15 min). |
| `JWT_REFRESH_TTL` | — | Durée de vie du refresh token (s). Défaut 604800 (7 j). |
| `PII_ENCRYPTION_KEY` | ✅ | Clé maître AES-256-GCM, **32 bytes en hexadécimal** (64 caractères). `openssl rand -hex 32`. |
| `EMAIL_HASH_SECRET` | ✅ | Secret HMAC pour `emailHash` (recherche / dédoublonnage des leads). |
| `NODE_ENV` | — | `development` / `test` / `production`. |
| `APP_BASE_URL` | ✅ | Base URL publique (liens tracking, désabonnement, OpenAPI servers…). |
| `INTERNAL_API_TOKEN` | — | Bearer pour les callbacks internes (ex. futur `/api/scraping/results`). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | SMTP par défaut. En dev : Mailpit / Mailtrap. |
| `WORKER_POLL_INTERVAL_MS` | — | Intervalle de polling de la file `jobs` par le worker. Défaut 3000. |
| `WORKER_CONCURRENCY` | — | Nombre de jobs traités en parallèle par le worker. Défaut 5. |
| `SCORING_WEIGHTS` | — | JSON optionnel pour surcharger les poids du lead scoring (CRM-019). Par défaut : voir `apps/web/lib/scoring.ts` (`DEFAULT_WEIGHTS`). |

> Pas de `REDIS_URL` : la file de tâches asynchrones est la collection MongoDB `jobs`, consommée par `apps/worker` en polling (pas de Redis dans l'architecture).
>
> Les comptes SMTP/IMAP **métier** ne passent pas par l'environnement : ils sont stockés chiffrés en base (`smtpConfigs` / `imapConfigs`).
