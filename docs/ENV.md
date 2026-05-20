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
| `WORKER_POLL_INTERVAL_MS` | — | Fréquence de scan Agenda côté worker (ms). Défaut **3000**. |
| `WORKER_CONCURRENCY` | — | Nombre max de jobs Agenda exécutés en parallèle (global). Défaut **5**. |
| `AGENDA_COLLECTION` | — | Nom de la collection MongoDB pour @hokify/agenda. Défaut **`crmAgendaJobs`**. |
| `AGENDA_TIMEZONE` | — | Fuseau IANA (ex. `Europe/Paris`) : prioritaire sur `workerConfig.agendaTimezone`. Appliqué au processus worker via `TZ`. |
| `SCORING_WEIGHTS` | — | JSON optionnel pour surcharger les poids du lead scoring (CRM-019). Par défaut : voir `apps/web/lib/scoring.ts` (`DEFAULT_WEIGHTS`). |
| `OPENAI_API_KEY` | — | Optionnel (M-05). Active la génération de variantes d’email dans **Paramètres → Emailing** (templates / blocs). Sans clé, l’API renvoie une erreur explicite. Ne jamais exposer au client. |
| `OPENAI_MODEL` | — | Modèle OpenAI pour M-05. Défaut : `gpt-4o-mini`. |

> Pas de `REDIS_URL` : la file asynchrone est **@hokify/agenda** sur MongoDB (collection `AGENDA_COLLECTION`, défaut `crmAgendaJobs`), consommée par `apps/worker`. L’API web planifie les jobs via le même connecteur sans lancer le processeur côté Next.js.
>
> Les comptes SMTP/IMAP **métier** ne passent pas par l'environnement : ils sont stockés chiffrés en base (`smtpConfigs` / `imapConfigs`).
