#!/usr/bin/env bash
# Déploiement depuis le poste de développement vers le serveur unique.
#
#   DEPLOY_HOST=ubuntu@1.2.3.4 pnpm deploy
#   DEPLOY_HOST=ubuntu@1.2.3.4 DEPLOY_DIR=/opt/crm-lead bash deploy/scripts/deploy.sh
#
# 1. synchronise le code (rsync, sans node_modules / .env / builds)
# 2. reconstruit et redémarre la stack (migrations Prisma appliquées par le service `migrate`)
# 3. vérifie /api/health
#
# Le fichier deploy/.env n'est JAMAIS envoyé : il vit uniquement sur le serveur.
set -euo pipefail
: "${DEPLOY_HOST:?DEPLOY_HOST requis (ex. ubuntu@1.2.3.4)}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/crm-lead}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "→ Synchronisation vers ${DEPLOY_HOST}:${DEPLOY_DIR}"
ssh "${DEPLOY_HOST}" "mkdir -p '${DEPLOY_DIR}'"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .turbo --exclude .git \
  --exclude .env --exclude 'deploy/.env' --exclude 'deploy/backups' \
  --exclude 'apps/scraper/.venv' --exclude __pycache__ --exclude uploads \
  "${ROOT}/" "${DEPLOY_HOST}:${DEPLOY_DIR}/"

echo "→ Build & redémarrage"
ssh "${DEPLOY_HOST}" "cd '${DEPLOY_DIR}' && test -f deploy/.env || { echo '✖ deploy/.env absent sur le serveur'; exit 1; }
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans
  docker image prune -f >/dev/null"

echo "→ Vérification"
DOMAIN=$(ssh "${DEPLOY_HOST}" "grep -E '^DOMAIN=' '${DEPLOY_DIR}/deploy/.env' | cut -d= -f2")
for i in $(seq 1 30); do
  if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    echo "✔ Déployé : https://${DOMAIN}"; exit 0
  fi
  sleep 5
done
echo "✖ /api/health ne répond pas — voir : ssh ${DEPLOY_HOST} 'cd ${DEPLOY_DIR} && docker compose -f deploy/docker-compose.yml logs --tail 100 web'"
exit 1
