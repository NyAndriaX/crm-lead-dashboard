# ─── CRM Web — mode développement (next dev) ─────────────────────
# Démarrage : db push, init-prod, puis `yarn workspace @crm/web dev`.
# Variables requises : DATABASE_URL, AUTH_JWT_SECRET, PII_ENCRYPTION_KEY, ADMIN_*…
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

# --- deps : cache des manifests uniquement ---
FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn install --frozen-lockfile

# --- runtime : sources + next dev (pas de build standalone) ---
FROM deps AS runtime
ENV NODE_ENV=development
ENV VERBOSE_INTERNAL_API_ERRORS=true
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV WATCHPACK_POLLING=true
COPY . .
RUN yarn workspace @crm/db generate

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=90s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["sh", "-c", "npx prisma db push --schema=packages/db/prisma/schema.prisma --skip-generate && node packages/db/prisma/init-prod.mjs && yarn workspace @crm/web dev"]
