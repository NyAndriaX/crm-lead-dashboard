#!/usr/bin/env bash
# Premier certificat TLS, à lancer UNE fois sur le serveur, avant le premier `up` de nginx.
#
#   deploy/scripts/init-ssl.sh                 # Let's Encrypt (DOMAIN + LETSENCRYPT_EMAIL de deploy/.env)
#   deploy/scripts/init-ssl.sh --self-signed   # certificat autosigné (test local, DOMAIN=localhost)
#
# Ensuite, le service `certbot` du compose renouvelle automatiquement le certificat.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
COMPOSE="docker compose -f docker-compose.yml --env-file .env"
command -v docker-compose >/dev/null && ! docker compose version >/dev/null 2>&1 && COMPOSE="docker-compose -f docker-compose.yml --env-file .env"

if [[ "${1:-}" == "--self-signed" ]]; then
  $COMPOSE run --rm --no-deps --entrypoint sh certbot -c "
    mkdir -p /etc/letsencrypt/live/${DOMAIN} &&
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj '/CN=${DOMAIN}' \
      -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
      -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  echo "✔ Certificat autosigné créé pour ${DOMAIN}"
  exit 0
fi

# nginx ne doit pas occuper le port 80 pendant l'émission (mode standalone).
$COMPOSE stop nginx >/dev/null 2>&1 || true
$COMPOSE run --rm --no-deps -p 80:80 --entrypoint certbot certbot certonly --standalone \
  -d "${DOMAIN}" --email "${LETSENCRYPT_EMAIL}" --agree-tos --no-eff-email --non-interactive
echo "✔ Certificat Let's Encrypt émis pour ${DOMAIN} — lancez : docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d"
