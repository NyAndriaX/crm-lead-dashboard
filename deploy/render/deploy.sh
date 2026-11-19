#!/usr/bin/env bash
# Déploiement automatique de la démo sur Render (offre gratuite) avec une base TiDB Cloud.
#
#   bash deploy/render/deploy.sh
#
# Demande (saisie masquée) : la clé d'API Render et la chaîne de connexion TiDB.
# Crée ou met à jour le service « crm-lead », lance le déploiement, attend qu'il soit en ligne
# et vérifie /api/health. Les secrets de l'application sont générés une fois et gardés dans
# deploy/render/.secrets (ignoré par git).
set -euo pipefail
cd "$(dirname "$0")"

API="https://api.render.com/v1"
NAME="${RENDER_SERVICE_NAME:-crm-lead}"
REGION="${RENDER_REGION:-frankfurt}"
IMAGE="ghcr.io/nyandriax/crm-lead-web:render"
SECRETS=".secrets"

need() { command -v "$1" >/dev/null || { echo "❌ « $1 » est requis."; exit 1; }; }
need curl; need jq; need openssl

# --- 1. Saisie des accès (jamais affichés) ---------------------------------------------------------
if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "Clé d'API Render (Account Settings → API Keys → Create API Key) :"
  read -rs RENDER_API_KEY; echo
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Chaîne de connexion TiDB Cloud (mysql://utilisateur:motdepasse@hôte:4000/crm) :"
  read -rs DATABASE_URL; echo
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
# shellcheck disable=SC1090
set -a; . "./$SECRETS"; set +a

api() { # api MÉTHODE CHEMIN [CORPS]
  local out code
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Accept: application/json" -H "Content-Type: application/json" ${3:+--data "$3"})
  code=$(tail -n1 <<<"$out"); out=$(sed '$d' <<<"$out")
  if [ "$code" -ge 400 ]; then echo "❌ Render $1 $2 → HTTP $code : $out" >&2; exit 1; fi
  printf '%s' "$out"
}

# --- 3. Image publique sur ghcr.io ---------------------------------------------------------------
echo "🔎 Vérification de l'image $IMAGE…"
until token=$(curl -fsS "https://ghcr.io/token?scope=repository:nyandriax/crm-lead-web:pull" | jq -r .token) \
   && curl -fsS -o /dev/null -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
        "https://ghcr.io/v2/nyandriax/crm-lead-web/manifests/render"; do
  echo "⏳ Image introuvable ou privée. Si GitHub Actions a fini de la construire, rends-la publique :"
  echo "   https://github.com/users/NyAndriaX/packages/container/crm-lead-web/settings → Change visibility → Public"
  echo "   Nouvelle vérification dans 30 s (Ctrl+C pour arrêter)…"; sleep 30
done
echo "✅ Image disponible."

# --- 4. Création ou mise à jour du service --------------------------------------------------------
OWNER=$(api GET "/owners?limit=20" | jq -r '.[0].owner.id')
[ -n "$OWNER" ] && [ "$OWNER" != null ] || { echo "❌ Espace de travail Render introuvable."; exit 1; }

env_json() { # $1 = APP_BASE_URL
  jq -n --arg db "$DATABASE_URL" --arg url "$1" \
    --arg pii "$PII_ENCRYPTION_KEY" --arg jwt "$AUTH_JWT_SECRET" --arg hash "$EMAIL_HASH_SECRET" \
    --arg tok "$INTERNAL_API_TOKEN" --arg ae "$SEED_ADMIN_EMAIL" --arg ap "$SEED_ADMIN_PASSWORD" --arg sp "$SEED_PASSWORD" '[
    {key:"NODE_ENV",value:"production"}, {key:"NODE_OPTIONS",value:"--max-old-space-size=384"},
    {key:"RUN_JOBS",value:"true"}, {key:"WORKER_CONCURRENCY",value:"1"}, {key:"QUEUE_SKIP_LOCKED",value:"false"},
    {key:"SCRAPING_LIVE",value:"false"}, {key:"WORKER_TIMEZONE",value:"Europe/Paris"},
    {key:"DATABASE_URL",value:$db}, {key:"APP_BASE_URL",value:$url},
    {key:"PII_ENCRYPTION_KEY",value:$pii}, {key:"AUTH_JWT_SECRET",value:$jwt},
    {key:"EMAIL_HASH_SECRET",value:$hash}, {key:"INTERNAL_API_TOKEN",value:$tok},
    {key:"SEED_ADMIN_EMAIL",value:$ae}, {key:"SEED_ADMIN_PASSWORD",value:$ap}, {key:"SEED_PASSWORD",value:$sp}
  ]'
}

SID=$(api GET "/services?name=$NAME&limit=20" | jq -r --arg n "$NAME" '[.[] | select(.service.name==$n)][0].service.id // empty')
if [ -z "$SID" ]; then
  echo "🆕 Création du service $NAME (offre gratuite, région $REGION)…"
  body=$(jq -n --arg n "$NAME" --arg o "$OWNER" --arg img "$IMAGE" --arg r "$REGION" \
    --argjson env "$(env_json "https://$NAME.onrender.com")" '{
      type:"web_service", name:$n, ownerId:$o, image:{ownerId:$o, imagePath:$img}, envVars:$env,
      serviceDetails:{runtime:"image", plan:"free", region:$r, healthCheckPath:"/api/health", numInstances:1}
    }')
  SID=$(api POST "/services" "$body" | jq -r '.service.id // .id')
else
  echo "♻️  Service existant ($SID) : mise à jour des variables."
fi

URL=$(api GET "/services/$SID" | jq -r '.serviceDetails.url')
api PUT "/services/$SID/env-vars" "$(env_json "$URL")" >/dev/null
DEPLOY=$(api POST "/services/$SID/deploys" '{"clearCache":"do_not_clear"}' | jq -r '.id')
echo "🚀 Déploiement lancé ($DEPLOY) → $URL"

# --- 5. Attente et vérification -------------------------------------------------------------------
for _ in $(seq 1 90); do
  status=$(api GET "/services/$SID/deploys/$DEPLOY" | jq -r '.status')
  case "$status" in
    live) break ;;
    *failed|canceled|deactivated) echo "❌ Déploiement : $status. Journaux : https://dashboard.render.com/web/$SID/logs"; exit 1 ;;
    *) echo "   … $status"; sleep 20 ;;
  esac
done
[ "$status" = live ] || { echo "❌ Délai dépassé. Journaux : https://dashboard.render.com/web/$SID/logs"; exit 1; }

echo "🩺 Santé : $(curl -fsS "$URL/api/health" | jq -c '{status, db: .checks.db.status, worker: .checks.worker.status}')"
cat <<EOF

✅ CRM Lead est en ligne : $URL
   Administrateur : $SEED_ADMIN_EMAIL  (mot de passe dans deploy/render/$SECRETS)
   L'IA se configure dans Configuration › Intelligence artificielle (jeton Claude ou clé d'API).
   Rappel : le service s'endort après 15 min sans visite ; le réveil prend environ une minute.
EOF
