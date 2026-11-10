# Variables d'environnement

Développement : copier `.env.example` → `.env` (racine, chargé par `dotenv-cli`). Production : `deploy/.env.production.example` → `deploy/.env` sur le serveur (voir `deploy/README.md`). Ne jamais committer de `.env`. Sauvegarder `PII_ENCRYPTION_KEY` hors du serveur (sa perte = perte des données chiffrées). Les valeurs sont validées au boot (`apps/web/lib/env.ts`) : l'app refuse de démarrer si une variable critique est absente ou mal formée.

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | URL MySQL 8 : `mysql://crm:crm@localhost:3307/crm` en dev (`pnpm db:up`). Construite par `deploy/docker-compose.yml` en production. |
| `AUTH_JWT_SECRET` | ✅ | Secret de signature des JWT (access + refresh). `openssl rand -base64 48`. |
| `JWT_ACCESS_TTL` | — | Durée de vie de l'access token (s). Défaut 900 (15 min). |
| `JWT_REFRESH_TTL` | — | Durée de vie du refresh token (s). Défaut 604800 (7 j). |
| `PII_ENCRYPTION_KEY` | ✅ | Clé maître AES-256-GCM, **32 bytes en hexadécimal** (64 caractères). `openssl rand -hex 32`. |
| `EMAIL_HASH_SECRET` | ✅ | Secret HMAC pour `emailHash` (recherche / dédoublonnage des leads). |
| `NODE_ENV` | — | `development` / `test` / `production`. |
| `APP_BASE_URL` | ✅ | Base URL publique (liens tracking, désabonnement, OpenAPI servers…). |
| `INTERNAL_API_TOKEN` | — | Bearer pour les callbacks internes (ex. futur `/api/scraping/results`). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | SMTP par défaut. En dev : Mailpit / Mailtrap. |
| `RUN_JOBS` | — | `true` (défaut) : les tâches de fond tournent dans le serveur Next.js. `false` : à exécuter par `pnpm jobs`. |
| `WORKER_POLL_INTERVAL_MS` | — | Fréquence de scan de la file `queue_jobs` quand elle est vide (ms). Défaut **3000**. |
| `WORKER_CONCURRENCY` | — | Nombre max de jobs exécutés en parallèle (global). Défaut **5**. |
| `WORKER_TIMEZONE` | — | Fuseau IANA (ex. `Europe/Paris`) : prioritaire sur `workerConfig.agendaTimezone`. Appliqué via `TZ`. |
| `UPLOAD_DIR` | — | Dossier des fichiers d'import. Défaut `./uploads` ; `/app/uploads` (volume) en production. |
| `SCRAPER_API_URL` / `SCRAPER_API_KEY` | — | URL du scraper (`http://localhost:8000` en dev, `http://scraper:8000` en Compose) et clé partagée. |
| `SCORING_WEIGHTS` | — | JSON optionnel pour surcharger les poids du lead scoring (CRM-019). Par défaut : voir `apps/web/lib/scoring.ts` (`DEFAULT_WEIGHTS`). |
| `CLAUDE_SKILLS_ENABLED` | — | Réglage IA **par défaut**, utilisé tant que l'administrateur n'a rien enregistré dans Configuration › Intelligence artificielle : `true` = Claude Skills actifs. Ensuite, c'est la table `aiConfig` qui fait foi (fournisseur, modèle, clé chiffrée). |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Jeton d'abonnement Claude pour le CLI en conteneur (`claude setup-token`). Peut aussi être saisi dans la Configuration (stocké chiffré, prioritaire). Inutile en dev si `claude login` est fait. `ANTHROPIC_API_KEY` est retiré de l'environnement du CLI. |
| `CLAUDE_MODEL` | — | (Claude uniquement) force un alias de modèle pour tous les skills. Non exposé dans l'interface : par défaut, `haiku` pour les tâches en volume, `sonnet` pour la rédaction. |
| `AI_TIMEOUT_MS` | — | Timeout d'une tâche IA, tous fournisseurs (`CLAUDE_TIMEOUT_MS` accepté). Défaut **120000**. |
| `AI_MAX_CONCURRENCY` | — | Tâches IA simultanées par service (`CLAUDE_MAX_CONCURRENCY` accepté). Défaut **2**. |
| `CLAUDE_SKILLS_ROOT` | — | Dossier contenant `.claude/skills` (défini à `/app` dans les images Docker ; en dev, détecté en remontant depuis le cwd). |
| `CLAUDE_BIN` | — | Chemin du binaire `claude`. Défaut : `claude` (PATH). |

> Pas de Redis ni de MongoDB : la file asynchrone est la table MySQL `queue_jobs` (`@crm/queue`), traitée par `@crm/jobs` dans le serveur web.
>
> Les comptes SMTP/IMAP **métier** ne passent pas par l'environnement : ils sont stockés chiffrés en base (`smtpConfigs` / `imapConfigs`).
>
> Les clés d'API des fournisseurs d'IA (OpenAI, DeepSeek, Mistral, Gemini…) ne passent pas non plus par l'environnement :
> l'administrateur les saisit dans Configuration › Intelligence artificielle ; elles sont chiffrées (`aiConfig.apiKeyEnc`)
> et transmises au scraper avec chaque mission.
