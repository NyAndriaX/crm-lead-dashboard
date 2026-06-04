#!/bin/sh
# Démarre le CRM selon RUN_MODE :
#   all     — web + worker (défaut, un seul conteneur)
#   web     — Next.js standalone uniquement (+ db push / init-prod)
#   worker  — worker Agenda uniquement
#   db-init — prisma generate + init-prod (one-shot)
set -e

SCHEMA="packages/db/prisma/schema.prisma"
RUN_MODE="${RUN_MODE:-all}"

db_push() {
  if [ "${SKIP_DB_PUSH}" = "true" ] || [ "${SKIP_DB_PUSH}" = "1" ]; then
    return 0
  fi
  echo "▶ prisma db push..."
  npx prisma db push --schema="$SCHEMA" --skip-generate
}

init_prod() {
  if [ "${SKIP_INIT_PROD}" = "true" ] || [ "${SKIP_INIT_PROD}" = "1" ]; then
    return 0
  fi
  echo "▶ init-prod..."
  node packages/db/prisma/init-prod.mjs
}

start_worker() {
  echo "▶ worker (Agenda)..."
  exec yarn workspace @crm/worker start
}

start_web() {
  db_push
  init_prod
  echo "▶ next standalone :${PORT:-3000}..."
  exec node apps/web/server.js
}

case "$RUN_MODE" in
  db-init)
    yarn workspace @crm/db generate
    yarn workspace @crm/db init-prod
    ;;
  web)
    start_web
    ;;
  worker)
    start_worker
    ;;
  all)
    db_push
    init_prod
    echo "▶ worker (arrière-plan)..."
    yarn workspace @crm/worker start &
    WORKER_PID=$!
    trap 'kill -TERM "$WORKER_PID" 2>/dev/null; wait "$WORKER_PID" 2>/dev/null' INT TERM
    echo "▶ next standalone :${PORT:-3000}..."
    node apps/web/server.js &
    WEB_PID=$!
    trap 'kill -TERM "$WORKER_PID" "$WEB_PID" 2>/dev/null; wait 2>/dev/null' INT TERM
    wait "$WEB_PID"
    EXIT=$?
    kill -TERM "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
    exit "$EXIT"
    ;;
  *)
    echo "RUN_MODE invalide: $RUN_MODE (attendu: all, web, worker, db-init)" >&2
    exit 1
    ;;
esac
