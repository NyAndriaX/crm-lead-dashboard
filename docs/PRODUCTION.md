# Déploiement PRODUCTION — CRM Lead Dashboard

## 1. Secrets obligatoires (le boot échoue sinon)

En `NODE_ENV=production`, `lib/env.ts` **refuse de démarrer** si les valeurs
d'exemple sont encore là. Générer de vrais secrets :

```bash
openssl rand -hex 32     # → PII_ENCRYPTION_KEY (64 hex)
openssl rand -base64 48  # → AUTH_JWT_SECRET (≥ 32 car.)
openssl rand -base64 32  # → EMAIL_HASH_SECRET
openssl rand -base64 32  # → INTERNAL_API_TOKEN
```

> 🧪 **Test prod-like en local** : pour lancer `yarn start:all` avec les
> secrets d'exemple jetables, mettre `ALLOW_INSECURE_PROD="true"` dans
> `.env` (désactive le garde-fou). **⚠️ STRICTEMENT INTERDIT sur un vrai
> serveur de production** — ne jamais définir cette variable en déploiement.

Variables prod requises :

| Variable | Exigence prod |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Mongo **dédié prod** (≠ base de dev/test) |
| `PII_ENCRYPTION_KEY` | 32 octets hex aléatoires (⚠️ ne JAMAIS la changer après prod : déchiffre la PII existante) |
| `AUTH_JWT_SECRET` | ≥ 32 caractères aléatoires |
| `EMAIL_HASH_SECRET` | aléatoire (≠ « change-me… ») |
| `APP_BASE_URL` | `https://...` (liens tracking/désinscription) |
| `INTERNAL_API_TOKEN` | aléatoire si défini |

> `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` **non défini** → comptes démo masqués
> sur `/login` (figé au `yarn run build`).

## 2. Base de données propre (zéro donnée démo)

`yarn db:seed` crée TOUJOURS des comptes/leads démo → **ne pas l'utiliser
en prod**. À la place :

```bash
yarn db:reset                                   # vide la base (force-reset)
ADMIN_EMAIL=ops@votredomaine.com \
ADMIN_PASSWORD='MotDePasseFort_min10' \
ADMIN_NAME='Ops' \
  yarn db:init-prod                             # 1 admin réel + pipeline. 0 démo
```

## 3. Lancer la prod

### Option A — Docker (recommandé)

```bash
docker compose up --build -d         # nextjs + worker + mongo(rs0) + nginx
```
Les Dockerfiles posent `NODE_ENV=production` et la sortie standalone.
`docker-compose.yml` lit le `.env` (mettez-y les vrais secrets) et
surcharge `DATABASE_URL` vers le service `mongo`.

### Option B — Bare-metal (sans Docker)

```bash
yarn run build          # build standalone
yarn start:prod         # serveur web standalone (copie static/public + NODE_ENV=production)
yarn worker:prod        # worker (crons imap-sync / sequence-tick / scraping-scheduler)
```
> `yarn run start` (= `next start`) est **incompatible** avec
> `output: standalone` — utiliser `yarn start:prod`.

Le **worker doit tourner** (process séparé) avec les MÊMES
`DATABASE_URL`, `PII_ENCRYPTION_KEY`, `EMAIL_HASH_SECRET`, `APP_BASE_URL`
que le web, sinon : pas d'envoi de campagnes/relances, pas de collecte
IMAP, pas de scraping planifié.

## 4. Couche AI Autopilot (optionnelle)

Sans clé → fallback déterministe (fonctionne, non-IA). Pour activer :

```
OPENAI_API_KEY=sk-...
AUTO_RESPONDER_MODE=draft        # off | draft | auto — "auto" envoie SANS validation humaine
AUTO_RESPONDER_MEETING_URL=https://calendly.com/...
SCRAPING_LIVE=false              # true = scrapers réels (Playwright + proxies + conformité CGU)
```

⚠️ `AUTO_RESPONDER_MODE=auto` : n'activer qu'après validation sur boîte de
test. `draft` génère un brouillon + notification (aucun envoi).

## 5. SMTP / IMAP

Les configs SMTP/IMAP se gèrent **dans l'app** (Paramètres → Emailing /
IMAP), chiffrées en base. Sans SMTP réel : les envois finissent en
`SOFT_BOUNCE` (comportement attendu).

## 6. Checklist go-live

- [ ] Secrets réels générés (section 1) — boot prod ne doit pas être bloqué
- [ ] `DATABASE_URL` = Mongo prod dédié (replica set requis)
- [ ] `yarn db:reset && yarn db:init-prod` exécuté sur la base prod
- [ ] `APP_BASE_URL` en https + reverse proxy/TLS (nginx)
- [ ] Web **et** worker démarrés, mêmes secrets
- [ ] Sonde externe sur `GET /api/health` (Uptime Robot/Datadog)
- [ ] Au moins 1 SMTP configuré dans Paramètres → Emailing
- [ ] `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` non défini au build
