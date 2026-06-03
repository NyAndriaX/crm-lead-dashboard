# Variables d'environnement

Copier `.env.example` → `.env`. Ne jamais committer `.env`. En production, les secrets viennent d'un coffre (Vault / KMS) — surtout `PII_ENCRYPTION_KEY` (sa perte = perte des données chiffrées). Les valeurs sont validées au boot (`apps/web/lib/env.ts`) : l'app refuse de démarrer si une variable critique est absente ou mal formée.

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | URI MySQL / MariaDB pour Prisma (ex. `mysql://user:pass@host:3306/db`). |
| `AUTH_JWT_SECRET` | ✅ | Secret de signature des JWT (access + refresh). `openssl rand -base64 48`. |
| `JWT_ACCESS_TTL` | — | Durée de vie de l'access token (s). Défaut 900 (15 min). |
| `JWT_REFRESH_TTL` | — | Durée de vie du refresh token (s). Défaut 604800 (7 j). |
| `PII_ENCRYPTION_KEY` | ✅ | Clé maître AES-256-GCM, **32 bytes en hexadécimal** (64 caractères). `openssl rand -hex 32`. |
| `EMAIL_HASH_SECRET` | ✅ | Secret HMAC pour `emailHash` (recherche / dédoublonnage des leads). |
| `NODE_ENV` | — | `development` / `test` / `production` (alias : `dev`, `prod`, `local` → normalisés au boot). |
| `ENV_STRICT` | — | Si `true` : en `NODE_ENV=production`, refuse de démarrer si secrets d'exemple ou faibles. Sinon : avertissements console uniquement. |
| `APP_BASE_URL` | ✅ | Base URL publique (liens tracking, désabonnement, OpenAPI servers…). |
| `INTERNAL_API_TOKEN` | — | Bearer pour les callbacks internes (ex. futur `/api/scraping/results`). |
| `VERBOSE_INTERNAL_API_ERRORS` | — | Si `true` ou `1` : les réponses `internal_error` exposent le message (et la stack) d’exception. Réservé au dépannage (Docker, staging) ; **désactivé** en production publique. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | SMTP par défaut. En dev : Mailpit / Mailtrap. |
| `WORKER_POLL_INTERVAL_MS` | — | Fréquence de scan Agenda côté worker (ms). Défaut **3000**. |
| `WORKER_CONCURRENCY` | — | Nombre max de jobs Agenda exécutés en parallèle (global). Défaut **5**. |
| `AGENDA_COLLECTION` | — | Nom de la collection MongoDB pour @hokify/agenda. Défaut **`crmAgendaJobs`**. |
| `AGENDA_TIMEZONE` | — | Fuseau IANA (ex. `Europe/Paris`) : prioritaire sur `workerConfig.agendaTimezone`. Appliqué au processus worker via `TZ`. |
| `SCORING_WEIGHTS` | — | JSON optionnel pour surcharger les poids du lead scoring (CRM-019). Par défaut : voir `apps/web/lib/scoring.ts` (`DEFAULT_WEIGHTS`). |
| _(OpenAI)_ | — | **Par utilisateur** : clé API chiffrée en base, configurable dans **Mon compte → Intégration IA** (`/account`). Plus de `OPENAI_API_KEY` dans l'environnement. |

> Pas de `REDIS_URL` : la file asynchrone est **@hokify/agenda** sur MongoDB (collection `AGENDA_COLLECTION`, défaut `crmAgendaJobs`), consommée par `apps/worker`. L’API web planifie les jobs via le même connecteur sans lancer le processeur côté Next.js.
>
> Les comptes SMTP/IMAP **métier** ne passent pas par l'environnement : ils sont stockés chiffrés en base (`smtpConfigs` / `imapConfigs`).
