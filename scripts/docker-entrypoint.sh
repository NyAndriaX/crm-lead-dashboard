#!/bin/sh
# Démarre le CRM selon RUN_MODE :
#   all     — web + worker (défaut, un seul conteneur)
#   web     — Next.js standalone uniquement (+ db push / init-prod)
#   worker  — worker Agenda uniquement
#   db-init  — prisma generate + db push + init-prod + migrate-data-owners (one-shot)
#   db-reset — vide TOUTE la base + recrée l'admin (CONFIRM_DB_RESET=true obligatoire)
set -e

SCHEMA="packages/db/prisma/schema.prisma"
RUN_MODE="${RUN_MODE:-all}"

strip_outer_quotes() {
  v="$1"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}
normalize_env() {
  if [ -n "${DATABASE_URL:-}" ]; then
    DATABASE_URL="$(strip_outer_quotes "$DATABASE_URL")"
    export DATABASE_URL
  fi
  if [ -n "${ADMIN_EMAIL:-}" ]; then
    ADMIN_EMAIL="$(strip_outer_quotes "$ADMIN_EMAIL")"
    export ADMIN_EMAIL
  fi
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(strip_outer_quotes "$ADMIN_PASSWORD")"
    export ADMIN_PASSWORD
  fi
  if [ -n "${ADMIN_NAME:-}" ]; then
    ADMIN_NAME="$(strip_outer_quotes "$ADMIN_NAME")"
    export ADMIN_NAME
  fi
}
normalize_env

db_push() {
  if [ "${SKIP_DB_PUSH}" = "true" ] || [ "${SKIP_DB_PUSH}" = "1" ]; then
    return 0
  fi
  echo "▶ prisma generate + db push..."
  npx prisma generate --schema="$SCHEMA"
  npx prisma db push --schema="$SCHEMA" --skip-generate
}

init_prod() {
  if [ "${SKIP_INIT_PROD}" = "true" ] || [ "${SKIP_INIT_PROD}" = "1" ]; then
    echo "▶ init-prod ignoré (SKIP_INIT_PROD=true)"
    return 0
  fi
  echo "▶ init-prod..."
  set +e
  node packages/db/prisma/init-prod.mjs
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "⚠ init-prod a échoué (code $rc)."
    echo "  → Vérifiez ADMIN_EMAIL et ADMIN_PASSWORD dans Dokploy (mot de passe avec # : utilisez des guillemets ou le champ dédié)."
    echo "  → Si l'admin existe déjà : SKIP_INIT_PROD=true"
    if [ "${INIT_PROD_STRICT}" = "true" ] || [ "${INIT_PROD_STRICT}" = "1" ]; then
      exit 1
    fi
    echo "  → Poursuite du démarrage web + worker (INIT_PROD_STRICT non activé)."
  fi
}

# Attribue ownerUserId / createdById aux données existantes (isolation multi-utilisateur).
migrate_data_owners() {
  if [ "${SKIP_MIGRATE_DATA_OWNERS}" = "true" ] || [ "${SKIP_MIGRATE_DATA_OWNERS}" = "1" ]; then
    echo "▶ migrate-data-owners ignoré (SKIP_MIGRATE_DATA_OWNERS=true)"
    return 0
  fi
  echo "▶ migrate-data-owners..."
  set +e
  node packages/db/scripts/migrate-data-owners.mjs --apply
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "⚠ migrate-data-owners a échoué (code $rc) — poursuite du démarrage."
  fi
}

cleanup_recurring_jobs() {
  if [ "${CLEANUP_RECURRING_JOBS:-true}" = "false" ] || [ "${CLEANUP_RECURRING_JOBS:-true}" = "0" ]; then
    echo "▶ cleanup-recurring-jobs ignoré (CLEANUP_RECURRING_JOBS=false)"
    return 0
  fi
  echo "▶ cleanup-recurring-jobs..."
  set +e
  node packages/db/scripts/cleanup-recurring-jobs.mjs
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "⚠ cleanup-recurring-jobs a échoué (code $rc) — poursuite du démarrage."
  fi
}

# Démarre le worker en arrière-plan et vérifie qu'il reste vivant.
start_worker_background() {
  echo "▶ worker (arrière-plan, tsx)..."
  # Logs sur stdout/stderr du conteneur (visible dans Dokploy)
  npx tsx apps/worker/src/index.ts &
  WORKER_PID=$!
  sleep 4
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "✖ Le worker s'est arrêté immédiatement (pid $WORKER_PID). Relisez les lignes [worker] ci-dessus."
    wait "$WORKER_PID" 2>/dev/null || true
    exit 1
  fi
  echo "✔ worker actif (pid $WORKER_PID)"
}

start_worker_foreground() {
  echo "▶ worker (tsx)..."
  exec npx tsx apps/worker/src/index.ts
}

start_web_foreground() {
  echo "▶ next standalone :${PORT:-3000}..."
  exec node apps/web/server.js
}

case "$RUN_MODE" in
  db-init)
    SKIP_DB_PUSH=0
    SKIP_INIT_PROD=0
    SKIP_MIGRATE_DATA_OWNERS=0
    yarn workspace @crm/db generate
    db_push
    yarn workspace @crm/db init-prod
    migrate_data_owners
    ;;
  db-reset)
    if [ "${CONFIRM_DB_RESET}" != "true" ] && [ "${CONFIRM_DB_RESET}" != "1" ]; then
      echo "✖ db-reset refusé : définissez CONFIRM_DB_RESET=true (supprime toutes les données)." >&2
      exit 1
    fi
    echo "▶ reset-prod (vidage complet de la base)..."
    node packages/db/scripts/reset-prod.mjs
    ;;
  web)
    db_push
    init_prod
    migrate_data_owners
    start_web_foreground
    ;;
  worker)
    cleanup_recurring_jobs
    start_worker_foreground
    ;;
  all)
    db_push
    init_prod
    migrate_data_owners
    cleanup_recurring_jobs
    start_worker_background
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
