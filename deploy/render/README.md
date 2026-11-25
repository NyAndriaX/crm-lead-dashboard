# Démo gratuite : Render + TiDB Cloud

Démonstration en ligne de CRM Lead sans carte bancaire, sur l'offre gratuite de Render : l'application
(interface, API, tâches de fond) et le scraper (FastAPI + Chromium, mode économe) en deux services ;
la base sur TiDB Cloud Starter (compatible MySQL).

Le plus simple : `bash deploy/render/deploy.sh` (crée ou met à jour les deux services, les relie et vérifie
leur santé ; `SCRAPER=false` pour ne déployer que l'application).

**Limites de cette démo** (le déploiement complet reste `deploy/README.md`, Docker Compose sur un serveur) :
- les services se mettent en veille après 15 min sans visite ; le réveil prend environ une minute ;
- le scraper tient dans 512 Mo grâce au mode économe (`LOW_MEMORY=true`, `EMAIL_CONCURRENCY=1` : un seul
  processus de rendu Chromium, images, médias et polices bloqués), sans marge : missions de 10 à 20 fiches ;
- pendant la prospection, l'analyse IA des fiches passe par un fournisseur à clé d'API (DeepSeek, Mistral,
  Gemini…) ; le CLI Claude n'est pas lancé dans le scraper (mémoire), les fiches sont alors collectées sans analyse ;
- les 750 h mensuelles gratuites sont partagées entre les deux services ;
- les tâches de fond ne tournent que lorsque le service est éveillé ;
- fichiers importés non conservés (disque éphémère).

## 1. Base TiDB Cloud
1. Créer un compte sur https://tidbcloud.com et une instance **Starter** (gratuite), région proche (Francfort).
2. *Connect* → *General* → copier la chaîne de connexion **Prisma** / MySQL et créer une base `crm` :
   `mysql://<user>:<mot_de_passe>@<hôte>:4000/crm?sslaccept=strict`

## 2. Images
Les images sont construites par GitHub Actions (`.github/workflows/render-image.yml`) et publiées sur
`ghcr.io/nyandriax/crm-lead-web:render` et `ghcr.io/nyandriax/crm-lead-scraper:render`. Après la première
construction, rendre chaque paquet **public** (GitHub → Packages → crm-lead-web / crm-lead-scraper →
Package settings → Change visibility → Public).

## 3. Render
1. Compte sur https://render.com (connexion avec GitHub).
2. *New* → *Blueprint* → dépôt `crm-lead-dashboard`, branche `feat/CRM-architecture-v2` (fichier `render.yaml`).
3. Renseigner les variables demandées :
   - `DATABASE_URL` : chaîne TiDB de l'étape 1 ;
   - `PII_ENCRYPTION_KEY` : `openssl rand -hex 32` ;
   - `APP_BASE_URL` : `https://crm-lead.onrender.com` (adresse affichée par Render) ;
   - `SCRAPER_API_URL` : adresse du service `crm-lead-scraper` (`https://crm-lead-scraper.onrender.com`) ;
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_PASSWORD` : comptes de la démo.
4. Au premier démarrage : migrations, puis données de démonstration (base vide uniquement).

L'IA se règle ensuite dans Configuration › Intelligence artificielle (jeton Claude ou clé d'API d'un autre fournisseur).

## Réveil automatique
L'application se garde elle-même éveillée : le job `keep-awake` (packages/jobs/src/keepAwake.ts) appelle sa
propre adresse et celle du scraper toutes les 10 min, du lundi au vendredi de 7 h à 21 h (heure de Madagascar ;
`KEEP_AWAKE_WINDOW`, `KEEP_AWAKE_TZ`, posés par `deploy.sh`), soit environ 650 h/mois sous le quota de 750 h.
Il ne faut qu'un réveil le matin : un appel planifié à 7 h (ex. cron-job.org ; un 503 pendant le réveil est
normal) ou la première visite. Pour une démonstration hors plage : GitHub → Actions → render-keep-awake →
*Run workflow* (durée en heures, 5 au maximum).

## Base propre (comme en production)
Avec `SEED_MODE=prod` dans `deploy/render/.secrets`, aucune donnée de démonstration n'est créée. Pour repartir
d'une base vide avec un vrai compte administrateur (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `ADMIN_NAME`) :

    RESET_DB=true bash deploy/render/deploy.sh

Le script demande de taper `EFFACER`, vide la base TiDB depuis ce poste (`prisma migrate reset`), lance
`init-prod.mjs` (compte administrateur, étapes du pipeline, configuration des tâches de fond) puis redéploie.
Le mot de passe de l'administrateur n'est pas envoyé à Render.

## Envoi par Gmail (API Google)
Render gratuit bloque les ports SMTP sortants (25, 465, 587) : Gmail en SMTP est impossible. L'application peut
envoyer depuis un Gmail par l'**API Gmail** (HTTPS), en plus des comptes SMTP classiques, qui restent disponibles.

Une seule fois, dans https://console.cloud.google.com :
1. **Nouveau projet** (ex. « CRM Lead »).
2. **API et services → Bibliothèque** → « Gmail API » → **Activer**.
3. **Écran de consentement OAuth** (Google Auth Platform) : type **Externe**, nom de l'application, adresse
   d'assistance ; **Accès aux données** → ajouter le champ d'application `.../auth/gmail.send` ; **Audience** →
   ajouter votre Gmail comme utilisateur test, puis **Publier l'application** (en « Test », Google invalide
   l'autorisation au bout de 7 jours). L'écran « application non validée » s'affiche ensuite : *Paramètres avancés →
   Accéder à CRM Lead*.
4. **Identifiants → Créer des identifiants → ID client OAuth** : type **Application Web**, URI de redirection
   autorisée : `https://crm-lead-nqdg.onrender.com/api/integrations/gmail/callback`
   (et `http://localhost:3000/api/integrations/gmail/callback` pour le développement).
5. Relancer `bash deploy/render/deploy.sh` : il demande l'identifiant client et le code secret (enregistrés dans
   `.secrets`).

Puis dans CRM Lead : **Configuration → Emailing → Connecter un compte Gmail**. Le compte « Gmail (API) » apparaît
dans la liste et se choisit comme n'importe quel compte d'envoi. Limite Gmail : 500 destinataires par jour.
