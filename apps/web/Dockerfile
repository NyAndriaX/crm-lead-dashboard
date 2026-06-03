# ─── CRM Web — production (Next.js standalone) ───────────────────
# Build standalone, puis au démarrage : db push, init-prod, Next.js.
# Variables requises : DATABASE_URL, AUTH_JWT_SECRET, PII_ENCRYPTION_KEY, ADMIN_*…
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- deps : cache des manifests uniquement ---
FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn install --frozen-lockfile

# --- build ---
FROM deps AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN yarn workspace @crm/db generate \
 && yarn workspace @crm/web build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db/prisma ./packages/db/prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["sh", "-ec", "echo '▶ prisma db push...' && npx prisma db push --schema=packages/db/prisma/schema.prisma --skip-generate && echo '▶ init-prod...' && node packages/db/prisma/init-prod.mjs && echo '▶ next standalone :'${PORT}'...' && exec node apps/web/server.js"]
