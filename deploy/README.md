# Déploiement — un seul serveur

```
Internet ──80/443──► nginx ──► web (Next.js : UI + API + tâches de fond) ──► mysql
                                 └──────────────► scraper (FastAPI + Chromium)
```

Tout tourne sur un VPS Ubuntu avec Docker Compose. Seul nginx est exposé ; MySQL et le scraper
restent sur le réseau Docker interne.

**Dimensionnement conseillé** : 2 vCPU, 4 Go de RAM (Chromium du scraper ≈ 1 Go en pointe), 40 Go de disque.

## 1. Préparer le serveur (une fois)

```bash
# DNS : enregistrement A  crm.exemple.fr → IP du serveur
scp deploy/scripts/bootstrap-server.sh ubuntu@IP:/tmp/
ssh ubuntu@IP 'sudo bash /tmp/bootstrap-server.sh'     # Docker, pare-feu (22/80/443), /opt/crm-lead
```

## 2. Premier déploiement

```bash
# a) envoyer le code (depuis le poste de dev)
DEPLOY_HOST=ubuntu@IP bash deploy/scripts/deploy.sh    # s'arrête car deploy/.env n'existe pas encore

# b) sur le serveur : configurer l'environnement
ssh ubuntu@IP
cd /opt/crm-lead
cp deploy/.env.production.example deploy/.env
nano deploy/.env        # DOMAIN, mots de passe MySQL, ADMIN_*, secrets (openssl rand -hex 32)

# c) certificat TLS puis démarrage
deploy/scripts/init-ssl.sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Au démarrage, le service `migrate` applique les migrations Prisma puis crée l'administrateur
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`) et les étapes du pipeline. Le web démarre ensuite et lance les
tâches de fond. Vérification : `https://crm.exemple.fr/api/health`.

> Selon l'installation, Compose est la commande `docker compose` (plugin) ou le binaire `docker-compose` :
> les deux acceptent exactement les mêmes options.

### Intelligence artificielle

Le fournisseur se choisit **dans l'application**, par un administrateur : Configuration ›
Intelligence artificielle. Rien à reconstruire ni à redémarrer.

| Fournisseur | Ce qu'il faut | Remarque |
|-------------|---------------|----------|
| Claude Skills (défaut) | jeton `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token` sur un poste connecté) | CLI embarqué dans les images web et scraper, pas de choix de modèle |
| OpenAI, DeepSeek, Mistral, Gemini | clé d'API | accès HTTPS sortant vers l'API |
| Ollama / service compatible OpenAI | URL du point d'accès (+ clé éventuelle) | depuis un conteneur, `localhost` désigne le conteneur : utiliser l'IP de l'hôte ou un service du réseau Docker |

Le bouton **Tester** exécute une vraie tâche (classement d'une réponse) avec la configuration saisie.
Les clés sont chiffrées en base avec `PII_ENCRYPTION_KEY` et ne repartent jamais vers le navigateur.
Le scraper reçoit la configuration avec chaque mission : il n'a rien à configurer.

`CLAUDE_SKILLS_ENABLED` / `CLAUDE_CODE_OAUTH_TOKEN` dans `deploy/.env` ne servent que de valeur
initiale tant que rien n'a été enregistré dans l'écran. IA désactivée : l'application fonctionne avec
ses replis déterministes (score calculé, templates sans réécriture, réponses à classer à la main).

## 3. Mises à jour

```bash
DEPLOY_HOST=ubuntu@IP pnpm deploy
```

Synchronise le code (le fichier `deploy/.env` du serveur n'est jamais écrasé), reconstruit les images,
applique les nouvelles migrations et vérifie `/api/health`.

## 4. Sauvegardes

```bash
crontab -e
30 2 * * * /opt/crm-lead/deploy/scripts/backup.sh >> /var/log/crm-backup.log 2>&1
```

Dump MySQL quotidien dans `deploy/backups/` (14 jours). Copier ces fichiers hors du serveur et
conserver `PII_ENCRYPTION_KEY` dans un coffre : sans elle, les emails et téléphones chiffrés sont perdus.

## 5. Commandes utiles

```bash
alias dc='docker compose -f deploy/docker-compose.yml --env-file deploy/.env'
dc ps                       # état des services
dc logs -f web              # logs application + tâches de fond
dc restart web              # redémarrage (les jobs en cours sont repris automatiquement)
dc exec mysql sh -c 'mysql -ucrm -p"$MYSQL_PASSWORD" crm'
```

## Test local de la stack de production

```bash
cp deploy/.env.production.example deploy/.env    # DOMAIN=localhost, secrets de test
echo -e "HTTP_PORT=8080\nHTTPS_PORT=8443" >> deploy/.env
deploy/scripts/init-ssl.sh --self-signed
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl -k https://localhost:8443/api/health
```

Les tests de bout en bout peuvent viser cette stack (navigateur Chrome installé sur le poste) :

```bash
E2E_BASE_URL=https://localhost:8443 E2E_EMAIL=… E2E_PASSWORD=… pnpm --filter @crm/web test:e2e
```

En test local avec des secrets jetables, ajouter `ALLOW_INSECURE_PROD=true` seulement si le garde-fou
de `lib/env.ts` refuse des valeurs d'exemple — **jamais sur un vrai serveur**.
