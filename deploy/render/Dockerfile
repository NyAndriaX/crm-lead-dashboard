# Image de démonstration pour Render (offre gratuite) + base TiDB Cloud (compatible MySQL).
# Un seul conteneur : application Next.js + tâches de fond. Les migrations et les données de démo
# sont appliquées au démarrage (start.sh), Render gratuit n'ayant pas d'étape « pre-deploy ».
# Construite par GitHub Actions (.github/workflows/render-image.yml), publiée sur ghcr.io.
FROM node:20-bookworm-slim
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/scraper/package.json apps/scraper/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/jobs/package.json packages/jobs/
COPY packages/queue/package.json packages/queue/
RUN pnpm install --frozen-lockfile

COPY . .
# Le client Prisma est intégré au bundle standalone, pas son moteur natif : on le copie là où Prisma le cherche.
RUN pnpm --filter @crm/db generate \
 && pnpm --filter @crm/web build \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
 && mkdir -p apps/web/.next/standalone/apps/web/.prisma/client \
 && cp -r node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/. apps/web/.next/standalone/apps/web/.prisma/client/

# CLI Claude Code : fournisseur « Claude Skills » (jeton CLAUDE_CODE_OAUTH_TOKEN saisi dans la configuration de l'IA).
RUN npm install -g @anthropic-ai/claude-code@2.1.78 && npm cache clean --force

ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=10000 CLAUDE_SKILLS_ROOT=/app UPLOAD_DIR=/tmp/uploads
EXPOSE 10000
CMD ["sh", "deploy/render/start.sh"]
