# Démo gratuite : Render + TiDB Cloud

Démonstration en ligne de CRM Lead sans carte bancaire : l'application (interface, API, tâches de fond) sur
l'offre gratuite de Render, la base sur TiDB Cloud Starter (compatible MySQL).

**Limites de cette démo** (le déploiement complet reste `deploy/README.md`, Docker Compose sur un serveur) :
- le service se met en veille après 15 min sans visite ; le réveil prend environ une minute ;
- pas de prospection réelle (le scraper Chromium ne tient pas dans l'offre gratuite) : `SCRAPING_LIVE=false` ;
- les tâches de fond ne tournent que lorsque le service est éveillé ;
- fichiers importés non conservés (disque éphémère).

## 1. Base TiDB Cloud
1. Créer un compte sur https://tidbcloud.com et une instance **Starter** (gratuite), région proche (Francfort).
2. *Connect* → *General* → copier la chaîne de connexion **Prisma** / MySQL et créer une base `crm` :
   `mysql://<user>:<mot_de_passe>@<hôte>:4000/crm?sslaccept=strict`

## 2. Image
L'image est construite par GitHub Actions (`.github/workflows/render-image.yml`) et publiée sur
`ghcr.io/nyandriax/crm-lead-web:render`. Après la première construction, rendre le paquet **public**
(GitHub → Packages → crm-lead-web → Package settings → Change visibility → Public).

## 3. Render
1. Compte sur https://render.com (connexion avec GitHub).
2. *New* → *Blueprint* → dépôt `crm-lead-dashboard`, branche `feat/CRM-architecture-v2` (fichier `render.yaml`).
3. Renseigner les variables demandées :
   - `DATABASE_URL` : chaîne TiDB de l'étape 1 ;
   - `PII_ENCRYPTION_KEY` : `openssl rand -hex 32` ;
   - `APP_BASE_URL` : `https://crm-lead.onrender.com` (adresse affichée par Render) ;
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_PASSWORD` : comptes de la démo.
4. Au premier démarrage : migrations, puis données de démonstration (base vide uniquement).

L'IA se règle ensuite dans Configuration › Intelligence artificielle (jeton Claude ou clé d'API d'un autre fournisseur).
