#!/bin/sh
# Démarrage sur Render : migrations, données de démo au premier lancement, puis serveur Next.js.
set -e
cd /app

echo "[render] migrations Prisma"
pnpm --filter @crm/db exec prisma migrate deploy

echo "[render] données de démonstration (seulement si la base est vide)"
node packages/db/prisma/seed-if-empty.mjs

mkdir -p "${UPLOAD_DIR:-/tmp/uploads}"
echo "[render] démarrage de l'application sur le port ${PORT:-10000}"
exec node apps/web/.next/standalone/apps/web/server.js
