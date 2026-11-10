# Application web — Next.js (UI + API) + tâches de fond (@crm/jobs via instrumentation.ts).
# Contexte de build : racine du monorepo (`docker compose -f deploy/docker-compose.yml build`).
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# --- deps : uniquement les manifestes, pour profiter du cache de couches ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/scraper/package.json apps/scraper/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/jobs/package.json packages/jobs/
COPY packages/queue/package.json packages/queue/
RUN pnpm install --frozen-lockfile

# --- build : client Prisma + build Next.js standalone ---
# Cette étape sert aussi d'image « migrate » (prisma migrate deploy + init-prod).
FROM deps AS build
COPY . .
RUN pnpm --filter @crm/db generate \
 && pnpm --filter @crm/web build \
 && mkdir -p /prisma-client \
 && cp -r node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/. /prisma-client/

# --- runtime : sortie standalone + CLI Claude Code ---
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# CLI Claude Code — exécute les skills (.claude/skills) quand le fournisseur IA « Claude Skills »
# est choisi dans la configuration (jeton CLAUDE_CODE_OAUTH_TOKEN). Les autres fournisseurs
# passent par leur API Chat Completions et n'ont pas besoin du CLI.
RUN npm install -g @anthropic-ai/claude-code@2.1.78 && npm cache clean --force
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Le client Prisma est intégré au bundle, mais pas son moteur natif (libquery_engine-*.so.node) :
# on le place dans apps/web/.prisma/client, un des dossiers où Prisma le cherche au démarrage.
COPY --from=build --chown=node:node /prisma-client ./apps/web/.prisma/client
COPY --chown=node:node .claude/skills ./.claude/skills
ENV CLAUDE_SKILLS_ROOT=/app
# Dossier des fichiers importés (CSV/XLSX), monté en volume.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
