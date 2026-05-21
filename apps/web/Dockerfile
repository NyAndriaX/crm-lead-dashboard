# Next.js (web) — build "standalone"
# Les images node:20 embarquent déjà Yarn 1.x (classic).
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- deps : ne copier que les manifests pour profiter du cache de couches ---
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

# --- runtime (sortie standalone de Next.js) ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# node_modules complets du build (superset du standalone, couvre mongodb + bcryptjs + deps)
COPY --from=build /app/node_modules ./node_modules
# Fichiers nécessaires pour init-prod au démarrage (connexion DB requise)
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
EXPOSE 3000
CMD ["sh", "-c", "node packages/db/prisma/init-prod.mjs && node apps/web/server.js"]
