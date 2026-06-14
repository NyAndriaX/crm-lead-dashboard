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
| `DATABASE_URL` | MySQL / MariaDB **dédié prod** (≠ base de dev/test) |
| `PII_ENCRYPTION_KEY` | 32 octets hex aléatoires (⚠️ ne JAMAIS la changer après prod : déchiffre la PII existante) |
| `AUTH_JWT_SECRET` | ≥ 32 caractères aléatoires |
| `EMAIL_HASH_SECRET` | aléatoire (≠ « change-me… ») |
| `APP_BASE_URL` | `https://votre-domaine.fr` (liens tracking, désinscription, cookies) |
| `INTERNAL_API_TOKEN` | aléatoire si défini |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Pour le premier `init-prod` au démarrage du conteneur (≥ 10 car.) |

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

Le conteneur Docker exécute aussi `init-prod` au premier démarrage (`RUN_MODE=all`).

## 3. Docker — un domaine, un conteneur (recommandé)

**Un seul Dockerfile au choix** — les trois produisent la **même image** (Next.js + worker) :

| Fichier | Commande build |
|---|---|
| `apps/web/Dockerfile` | `docker build -f apps/web/Dockerfile -t crm-app .` |
| `apps/worker/Dockerfile` | `docker build -f apps/worker/Dockerfile -t crm-app .` |
| `Dockerfile` (racine) | `docker build -t crm-app .` |

Le **contexte de build est toujours la racine du dépôt** (le `.` final).

```bash
# 1. Build (exemple avec apps/web/Dockerfile)
docker build -f apps/web/Dockerfile -t crm-app .

# 2. Run — web + worker dans le même conteneur (RUN_MODE=all par défaut)
docker run -d \
  --name crm \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  crm-app
```

Au démarrage le conteneur enchaîne : `prisma db push` → `init-prod` → worker (arrière-plan) → Next.js sur le port **3000**.

### Reverse proxy (Nginx / Traefik / Caddy)

Exposez **un seul domaine** vers le port 3000 du conteneur, par exemple :

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Mettre `APP_BASE_URL=https://votre-domaine.fr` dans `.env`.

### Comportement intégré à l'image Docker (rien à configurer dans Dokploy)

| Réglage | Valeur par défaut | Où c'est défini |
|---|---|---|
| `RUN_MODE` | `all` (web + worker) | `Dockerfile` + `scripts/docker-entrypoint.sh` |
| `UPLOAD_DIR` | `/app/uploads` | `Dockerfile` + code (`getUploadDir()` en prod) |
| `INLINE_IMPORT_MAX_ROWS` | `500` | code (`startImportJob`) |

> **Ne pas** ajouter `RUN_MODE` ni `UPLOAD_DIR` dans les variables Dokploy — c'est déjà inclus dans l'image.

### Variables utiles (optionnelles)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP Next.js |
| `SKIP_DB_PUSH` | — | `true` pour sauter `prisma db push` |
| `SKIP_INIT_PROD` | — | `true` pour sauter `init-prod` |

### Volume uploads (imports CSV) — **recommandé en prod**

Les fichiers importés sont stockés dans `/app/uploads` (créé automatiquement au démarrage).
Sans volume persistant, un redéploiement Docker **efface les fichiers** en attente de traitement.

Dans Dokploy : ajouter un volume monté sur **`/app/uploads`** (seule action requise côté imports).

### Logs

```bash
docker logs -f crm
```

Healthcheck intégré : `GET /api/health` sur le port 3000.

### Dokploy — échec build `yarn install` / `ESOCKETTIMEDOUT`

Si les logs montrent :

```text
There appears to be trouble with your network connection. Retrying...
error Error: https://registry.npmjs.org/... ESOCKETTIMEDOUT
```

ce n’est **pas un bug applicatif** : le **serveur Dokploy** n’arrive pas à télécharger les paquets npm assez vite pendant `docker build` (connexion sortante lente ou instable).

**Actions :**

1. **Relancer le déploiement** (souvent transitoire).
2. **Pousser le commit** avec `.yarnrc` + Dockerfile durci (timeout 10 min, retries, IPv4 prioritaire).
3. Sur le VPS hôte Dokploy, vérifier l’accès npm :
   ```bash
   curl -I https://registry.npmjs.org/
   ```
4. Si ça échoue souvent : configurer le DNS Docker (`/etc/docker/daemon.json` → `"dns": ["8.8.8.8","1.1.1.1"]`) puis `systemctl restart docker`.
5. **Alternative fiable** : builder l’image en **GitLab CI** et déployer l’image déjà buildée (registry) au lieu de builder sur le VPS.

Variables build Dokploy optionnelles :

| Variable | Valeur |
|---|---|
| `NODE_OPTIONS` | `--dns-result-order=ipv4first` |

## 4. Bare-metal (sans Docker)

```bash
yarn run build
yarn start:all    # ou : yarn start:prod + yarn worker:prod (2 terminaux)
```

> `yarn run start` (= `next start`) est **incompatible** avec `output: standalone` — utiliser `yarn start:prod`.

Le worker doit tourner avec les **mêmes** secrets que le web (`DATABASE_URL`, `PII_ENCRYPTION_KEY`, etc.).

## 5. Couche IA (optionnelle)

Chaque utilisateur configure sa clé OpenAI dans **Mon compte → Intégration IA** (`/account`). Pas de `OPENAI_API_KEY` dans l'environnement serveur.

```
AUTO_RESPONDER_MODE=draft        # off | draft | auto
AUTO_RESPONDER_MEETING_URL=https://calendly.com/...
SCRAPING_LIVE=false
SCRAPER_API_URL=https://votre-scraper.example.com
```
