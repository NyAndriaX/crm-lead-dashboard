#!/usr/bin/env bash
# Déploiement automatique de la démo sur Render (offre gratuite) avec une base TiDB Cloud.
#
#   bash deploy/render/deploy.sh
#
# Demande (saisie masquée) : la clé d'API Render et la chaîne de connexion TiDB.
# Crée ou met à jour deux services gratuits : « crm-lead-scraper » (FastAPI + Chromium, mode économe)
# puis « crm-lead » (application), les relie, lance les déploiements, attend qu'ils soient en ligne
# et vérifie leur santé. SCRAPER=false pour ne déployer que l'application, sans prospection réelle.
#
# Données : SEED_MODE=prod dans .secrets → base propre (compte administrateur, étapes du pipeline ; aucune
# donnée de démonstration), sinon données de démo au premier démarrage.
#   RESET_DB=true bash deploy/render/deploy.sh   → VIDE la base TiDB (confirmation demandée) puis crée le
#   compte administrateur de .secrets (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / ADMIN_NAME) depuis ce poste. Les secrets de l'application sont générés une fois et gardés dans
# deploy/render/.secrets (ignoré par git).
set -euo pipefail
cd "$(dirname "$0")"

API="https://api.render.com/v1"
NAME="${RENDER_SERVICE_NAME:-crm-lead}"
REGION="${RENDER_REGION:-frankfurt}"
IMAGE="ghcr.io/nyandriax/crm-lead-web:render"
SCRAPER="${SCRAPER:-true}"
SCRAPER_NAME="${RENDER_SCRAPER_NAME:-crm-lead-scraper}"
SCRAPER_IMAGE="ghcr.io/nyandriax/crm-lead-scraper:render"
SECRETS=".secrets"

need() { command -v "$1" >/dev/null || { echo "❌ « $1 » est requis."; exit 1; }; }
need curl; need jq; need openssl

# --- 1. Saisie des accès (jamais affichés) ---------------------------------------------------------
if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "Clé d'API Render (Account Settings → API Keys → Create API Key) :"
  read -rs RENDER_API_KEY; echo
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Chaîne de connexion TiDB Cloud (mysql://utilisateur:motdepasse@hôte:4000/crm)"
  echo "(Entrée sans rien taper : reprendre celle du service Render déjà déployé) :"
  read -rs DATABASE_URL; echo
fi
if [ -z "$DATABASE_URL" ]; then
  auth=(-H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json")
  sid=$(curl -fsS "${auth[@]}" "$API/services?name=$NAME&limit=20" \
        | jq -r --arg n "$NAME" '[.[] | select(.service.name==$n)][0].service.id // empty') || sid=""
  [ -n "$sid" ] && DATABASE_URL=$(curl -fsS "${auth[@]}" "$API/services/$sid/env-vars?limit=100" \
        | jq -r '[.[] | (.envVar // .) | select(.key=="DATABASE_URL")][0].value // empty') || true
  [ -n "$DATABASE_URL" ] || { echo "❌ Aucune chaîne trouvée sur Render (service $NAME) : saisis-la."; exit 1; }
  echo "ℹ️  Chaîne de connexion reprise du service Render $NAME."
fi
case "$DATABASE_URL" in
  mysql://*) ;;
  *) echo "❌ La chaîne doit commencer par mysql://"; exit 1 ;;
esac
# Base applicative : TiDB propose « sys » ou « test » par défaut ; Prisma refuse les bases système.
if [[ "$DATABASE_URL" =~ ^(mysql://[^/]+)/?([^?]*)(\?.*)?$ ]]; then
  db="${BASH_REMATCH[2]}"
  case "$db" in ""|sys|test|mysql|information_schema|performance_schema|metrics_schema)
    DATABASE_URL="${BASH_REMATCH[1]}/crm${BASH_REMATCH[3]}"
    echo "ℹ️  Base « ${db:-aucune} » remplacée par « crm » dans la chaîne de connexion." ;;
  esac
fi
# Prisma exige TLS vers TiDB Cloud.
case "$DATABASE_URL" in *sslaccept=*) ;; *\?*) DATABASE_URL="$DATABASE_URL&sslaccept=strict" ;; *) DATABASE_URL="$DATABASE_URL?sslaccept=strict" ;; esac

# --- 2. Secrets de l'application (générés une seule fois) ------------------------------------------
if [ ! -f "$SECRETS" ]; then
  umask 077
  {
    echo "PII_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)"
    echo "EMAIL_HASH_SECRET=$(openssl rand -hex 32)"
    echo "INTERNAL_API_TOKEN=$(openssl rand -hex 24)"
    echo "SEED_ADMIN_EMAIL=${SEED_ADMIN_EMAIL:-admin@datalia-demo.app}"
    echo "SEED_ADMIN_PASSWORD=$(openssl rand -hex 8)Aa1!"
    echo "SEED_PASSWORD=$(openssl rand -hex 8)Bb2!"
  } > "$SECRETS"
  echo "🔐 Secrets générés dans deploy/render/$SECRETS (à conserver : la clé PII déchiffre les données)."
fi
SEED_MODE=""; ADMIN_NAME=""
# Ajouté après coup : complété dans un fichier .secrets existant.
grep -q '^SCRAPER_API_KEY=' "$SECRETS" || echo "SCRAPER_API_KEY=$(openssl rand -hex 24)" >> "$SECRETS"
# shellcheck disable=SC1090
set -a; . "./$SECRETS"; set +a

# Envoi par l'API Gmail (« Connecter un compte Gmail ») : client OAuth Google, demandé une seule fois.
# Render gratuit bloque les ports SMTP sortants : c'est la voie gratuite pour envoyer depuis un Gmail.
if [ -z "${GOOGLE_OAUTH_CLIENT_ID:-}" ] && [ "${SKIP_GOOGLE:-}" != true ]; then
  echo "Envoi par Gmail (facultatif) — identifiant client OAuth Google (…apps.googleusercontent.com)"
  echo "(Entrée sans rien taper pour passer ; voir deploy/render/README.md, « Envoi par Gmail ») :"
  read -r GOOGLE_OAUTH_CLIENT_ID
  if [ -n "$GOOGLE_OAUTH_CLIENT_ID" ]; then
    echo "Code secret du client OAuth Google :"
    read -rs GOOGLE_OAUTH_CLIENT_SECRET; echo
    { echo "GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID"; echo "GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_OAUTH_CLIENT_SECRET"; } >> "$SECRETS"
    echo "🔐 Client OAuth Google enregistré dans deploy/render/$SECRETS."
  fi
fi

api() { # api MÉTHODE CHEMIN [CORPS]
  local out code
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Accept: application/json" -H "Content-Type: application/json" ${3:+--data "$3"})
  code=$(tail -n1 <<<"$out"); out=$(sed '$d' <<<"$out")
  if [ "$code" -ge 400 ]; then echo "❌ Render $1 $2 → HTTP $code : $out" >&2; exit 1; fi
  printf '%s' "$out"
}

# --- 3. Images publiques sur ghcr.io ---------------------------------------------------------------
wait_image() { # wait_image NOM_DU_PAQUET (ex. crm-lead-web)
  local pkg="$1" token
  echo "🔎 Vérification de l'image ghcr.io/nyandriax/$pkg:render…"
  until token=$(curl -fsS "https://ghcr.io/token?scope=repository:nyandriax/$pkg:pull" | jq -r .token) \
     && curl -fsS -o /dev/null -H "Authorization: Bearer $token" \
          -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
          "https://ghcr.io/v2/nyandriax/$pkg/manifests/render"; do
    echo "⏳ Image introuvable ou privée. Si GitHub Actions a fini de la construire, rends-la publique :"
    echo "   https://github.com/users/NyAndriaX/packages/container/$pkg/settings → Change visibility → Public"
    echo "   Nouvelle vérification dans 30 s (Ctrl+C pour arrêter)…"; sleep 30
  done
  echo "✅ Image $pkg disponible."
}
wait_image crm-lead-web
[ "$SCRAPER" = true ] && wait_image crm-lead-scraper

# --- 4. Création ou mise à jour du service --------------------------------------------------------
OWNER=$(api GET "/owners?limit=20" | jq -r '.[0].owner.id')
[ -n "$OWNER" ] && [ "$OWNER" != null ] || { echo "❌ Espace de travail Render introuvable."; exit 1; }

env_json() { # $1 = APP_BASE_URL, $2 = adresse du scraper (vide : pas de prospection réelle)
  jq -n --arg db "$DATABASE_URL" --arg url "$1" --arg scr "$2" --arg sk "$SCRAPER_API_KEY" \
    --arg pii "$PII_ENCRYPTION_KEY" --arg jwt "$AUTH_JWT_SECRET" --arg hash "$EMAIL_HASH_SECRET" \
    --arg tok "$INTERNAL_API_TOKEN" --arg mode "$SEED_MODE" \
    --arg kw "${KEEP_AWAKE_WINDOW:-1-5 07:00-21:00}" --arg ktz "${KEEP_AWAKE_TZ:-Indian/Antananarivo}" \
    --arg gid "${GOOGLE_OAUTH_CLIENT_ID:-}" --arg gsec "${GOOGLE_OAUTH_CLIENT_SECRET:-}" \
    --arg ae "$SEED_ADMIN_EMAIL" --arg ap "$SEED_ADMIN_PASSWORD" --arg sp "$SEED_PASSWORD" '[
    {key:"NODE_ENV",value:"production"}, {key:"NODE_OPTIONS",value:"--max-old-space-size=384"},
    {key:"RUN_JOBS",value:"true"}, {key:"WORKER_CONCURRENCY",value:"1"}, {key:"QUEUE_SKIP_LOCKED",value:"false"},
    {key:"WORKER_TIMEZONE",value:"Europe/Paris"},
    {key:"DATABASE_URL",value:$db}, {key:"APP_BASE_URL",value:$url},
    {key:"PII_ENCRYPTION_KEY",value:$pii}, {key:"AUTH_JWT_SECRET",value:$jwt},
    {key:"EMAIL_HASH_SECRET",value:$hash}, {key:"INTERNAL_API_TOKEN",value:$tok},
    # Maintien en éveil par l’application elle-même (job keep-awake, packages/jobs/src/keepAwake.ts) :
    # elle appelle sa propre adresse et celle du scraper toutes les 10 min pendant la plage horaire.
    {key:"KEEP_AWAKE_URLS",value:([$url + "/api/health"] + (if $scr == "" then [] else [$scr + "/health"] end) | join(" "))},
    {key:"KEEP_AWAKE_WINDOW",value:$kw}, {key:"KEEP_AWAKE_TZ",value:$ktz}
  ]
  + (if $gid == "" then [] else [{key:"GOOGLE_OAUTH_CLIENT_ID",value:$gid}, {key:"GOOGLE_OAUTH_CLIENT_SECRET",value:$gsec}] end)
  # Production : le compte administrateur est créé depuis ce poste (RESET_DB=true), son mot de passe
  # n’est pas confié à Render. Démo : comptes créés au premier démarrage.
  + (if $mode == "prod" then [{key:"SEED_MODE",value:"prod"}] else [
    {key:"SEED_ADMIN_EMAIL",value:$ae}, {key:"SEED_ADMIN_PASSWORD",value:$ap}, {key:"SEED_PASSWORD",value:$sp}
  ] end)
  + (if $scr == "" then [{key:"SCRAPING_LIVE",value:"false"}] else [
    {key:"SCRAPING_LIVE",value:"true"}, {key:"SCRAPER_API_URL",value:$scr}, {key:"SCRAPER_API_KEY",value:$sk},
    # Le scraper endormi met environ une minute à se réveiller : la vérification de santé l’attend.
    {key:"SCRAPER_HEALTH_TIMEOUT_MS",value:"120000"}
  ] end)'
}

scraper_env_json() { # mode économe : tient dans les 512 Mo de l'offre gratuite
  jq -n --arg sk "$SCRAPER_API_KEY" '[
    {key:"PORT",value:"8000"}, {key:"SCRAPER_API_KEY",value:$sk},
    {key:"LOW_MEMORY",value:"true"}, {key:"EMAIL_CONCURRENCY",value:"1"},
    {key:"HEADLESS",value:"true"}, {key:"LOG_LEVEL",value:"INFO"}
  ]'
}

ensure_service() { # ensure_service NOM IMAGE CHEMIN_SANTÉ ENV_JSON → affiche l'identifiant
  local name="$1" image="$2" health="$3" env="$4" sid body
  sid=$(api GET "/services?name=$name&limit=20" | jq -r --arg n "$name" '[.[] | select(.service.name==$n)][0].service.id // empty')
  if [ -z "$sid" ]; then
    echo "🆕 Création du service $name (offre gratuite, région $REGION)…" >&2
    body=$(jq -n --arg n "$name" --arg o "$OWNER" --arg img "$image" --arg r "$REGION" --arg h "$health" \
      --argjson env "$env" '{
        type:"web_service", name:$n, ownerId:$o, image:{ownerId:$o, imagePath:$img}, envVars:$env,
        serviceDetails:{runtime:"image", plan:"free", region:$r, healthCheckPath:$h, numInstances:1}
      }')
    sid=$(api POST "/services" "$body" | jq -r '.service.id // .id')
  else
    echo "♻️  Service $name existant ($sid) : mise à jour des variables." >&2
  fi
  printf '%s' "$sid"
}

deploy_and_wait() { # deploy_and_wait IDENTIFIANT NOM
  local sid="$1" name="$2" dep status=""
  dep=$(api POST "/services/$sid/deploys" '{"clearCache":"do_not_clear"}' | jq -r '.id')
  echo "🚀 Déploiement de $name lancé ($dep)."
  for _ in $(seq 1 90); do
    status=$(api GET "/services/$sid/deploys/$dep" | jq -r '.status')
    case "$status" in
      live) echo "✅ $name en ligne."; return 0 ;;
      *failed|canceled|deactivated) echo "❌ $name : $status. Journaux : https://dashboard.render.com/web/$sid/logs"; exit 1 ;;
      *) echo "   … $name : $status"; sleep 20 ;;
    esac
  done
  echo "❌ Délai dépassé pour $name. Journaux : https://dashboard.render.com/web/$sid/logs"; exit 1
}

# 4a. Scraper (créé d'abord : l'application a besoin de son adresse).
SCRAPER_URL=""
if [ "$SCRAPER" = true ]; then
  SCRAPER_SID=$(ensure_service "$SCRAPER_NAME" "$SCRAPER_IMAGE" "/health" "$(scraper_env_json)")
  SCRAPER_URL=$(api GET "/services/$SCRAPER_SID" | jq -r '.serviceDetails.url')
  api PUT "/services/$SCRAPER_SID/env-vars" "$(scraper_env_json)" >/dev/null
fi

# 4b. Application.
SID=$(ensure_service "$NAME" "$IMAGE" "/api/health" "$(env_json "https://$NAME.onrender.com" "$SCRAPER_URL")")
URL=$(api GET "/services/$SID" | jq -r '.serviceDetails.url')
api PUT "/services/$SID/env-vars" "$(env_json "$URL" "$SCRAPER_URL")" >/dev/null

# --- 4c. Remise à zéro de la base (optionnelle, depuis ce poste) ------------------------------------
if [ "${RESET_DB:-false}" = true ]; then
  ROOT="$(cd ../.. && pwd)"
  [ -x "$ROOT/packages/db/node_modules/.bin/prisma" ] || { echo "❌ Dépendances absentes : lance « pnpm install » à la racine."; exit 1; }
  echo "⚠️  RESET_DB : TOUTES les données de la base TiDB vont être effacées (leads, comptes, campagnes…)."
  echo "   Compte administrateur recréé ensuite : $SEED_ADMIN_EMAIL"
  read -rp "   Tape EFFACER pour confirmer : " ok
  [ "$ok" = EFFACER ] || { echo "Annulé."; exit 1; }
  (cd "$ROOT/packages/db" && DATABASE_URL="$DATABASE_URL" ./node_modules/.bin/prisma migrate reset --force --skip-seed --skip-generate)
  (cd "$ROOT/packages/db" && DATABASE_URL="$DATABASE_URL" WORKER_TIMEZONE=Europe/Paris \
     ADMIN_EMAIL="$SEED_ADMIN_EMAIL" ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" ADMIN_NAME="${ADMIN_NAME:-Administrateur}" \
     node prisma/init-prod.mjs)
  # Le redéploiement qui suit relance les tâches de fond (tâches récurrentes recréées dans la base vide).
fi

# --- 5. Déploiements, attente et vérification -------------------------------------------------------
[ "$SCRAPER" = true ] && deploy_and_wait "$SCRAPER_SID" "$SCRAPER_NAME"
deploy_and_wait "$SID" "$NAME"

echo "🩺 Santé : $(curl -fsS "$URL/api/health" | jq -c '{status, db: .checks.db.status, worker: .checks.worker.status}')"
[ "$SCRAPER" = true ] && echo "🩺 Scraper : $(curl -fsS --max-time 120 "$SCRAPER_URL/health" | jq -c .)"
cat <<EOF

✅ CRM Lead est en ligne : $URL
   Administrateur : $SEED_ADMIN_EMAIL  (mot de passe dans deploy/render/$SECRETS)
   Scraper : ${SCRAPER_URL:-désactivé (SCRAPER=false)}
   L'IA se configure dans Configuration › Intelligence artificielle. Pendant la prospection, le scraper
   (512 Mo) n'exécute pas le CLI Claude : choisir un fournisseur à clé d'API (DeepSeek, Mistral, Gemini…)
   pour l'analyse des fiches ; avec Claude Skills, les fiches sont collectées sans analyse IA.
   Rappel : les services s'endorment après 15 min sans visite ; le réveil prend environ une minute.
EOF
