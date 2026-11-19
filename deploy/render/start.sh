#!/bin/sh
# Démarrage sur Render : migrations, initialisation d’une base vide (démo ou SEED_MODE=prod), puis serveur Next.js.
set -e
cd /app

echo "[render] migrations Prisma"
pnpm --filter @crm/db exec prisma migrate deploy

echo "[render] initialisation de la base (seulement si elle est vide ; SEED_MODE=prod : sans données de démo)"
node packages/db/prisma/seed-if-empty.mjs

mkdir -p "${UPLOAD_DIR:-/tmp/uploads}"
echo "[render] démarrage de l'application sur le port ${PORT:-10000}"
exec node apps/web/.next/standalone/apps/web/server.js
