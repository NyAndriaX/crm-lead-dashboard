# CRM — Next.js + worker dans le même conteneur (RUN_MODE=all par défaut).
# Contexte build = racine du dépôt :
#   docker build -f apps/web/Dockerfile -t crm-app .
#   docker run --env-file .env -p 3000:3000 crm-app
#
# Source canonique : docker/Dockerfile.app (garder les deux en sync).
# RUN_MODE optionnel : all | web | worker | db-init
# Les scripts DB sont désactivés par défaut au démarrage. Utiliser RUN_MODE=db-init pour les lancer.
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
ENV NODE_OPTIONS=--dns-result-order=ipv4first
RUN apt-get update -y && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock .yarnrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn config set network-timeout 600000 \
 && yarn install --frozen-lockfile --network-timeout 600000 \
 || (echo "▶ yarn install retry 1/2..." && sleep 20 && yarn install --frozen-lockfile --network-timeout 600000) \
 || (echo "▶ yarn install retry 2/2..." && sleep 40 && yarn install --frozen-lockfile --network-timeout 600000)

FROM deps AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN yarn workspace @crm/db generate \
 && yarn workspace @crm/web build

FROM base AS prod-deps
ENV NODE_OPTIONS=--dns-result-order=ipv4first
RUN apt-get update -y && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock .yarnrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn config set network-timeout 600000 \
 && yarn install --frozen-lockfile --production=true --ignore-scripts --network-timeout 600000 \
 || (echo "▶ yarn production install retry 1/2..." && sleep 20 && yarn install --frozen-lockfile --production=true --ignore-scripts --network-timeout 600000) \
 || (echo "▶ yarn production install retry 2/2..." && sleep 40 && yarn install --frozen-lockfile --production=true --ignore-scripts --network-timeout 600000)

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RUN_MODE=all
ENV UPLOAD_DIR=/app/uploads
ENV SKIP_DB_PUSH=true
ENV SKIP_INIT_PROD=true
ENV SKIP_MIGRATE_DATA_OWNERS=true

RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/uploads

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/yarn.lock ./yarn.lock
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages
# Schéma Prisma + scripts DB (db push, init-prod, migrate-data-owners au démarrage)
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/packages/db/scripts ./packages/db/scripts
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=25s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
