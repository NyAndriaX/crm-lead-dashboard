# syntax=docker/dockerfile:1.7
# Image CRM — Next.js (standalone) + worker Agenda dans le même conteneur.
# Build depuis la racine du dépôt :
#   docker build -f docker/Dockerfile.app -t crm-app .
#   docker build -f apps/web/Dockerfile -t crm-app .
#   docker build -f apps/worker/Dockerfile -t crm-app .
#
# RUN_MODE (optionnel) : all (défaut) | web | worker | db-init
# Les scripts DB sont désactivés par défaut au démarrage. Utiliser RUN_MODE=db-init pour les lancer.
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--dns-result-order=ipv4first
ENV YARN_CACHE_FOLDER=/tmp/.yarn-cache

FROM base AS deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
 --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
 apt-get update -y && apt-get install -y --no-install-recommends ca-certificates openssl
COPY package.json yarn.lock .yarnrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN --mount=type=cache,id=crm-yarn,target=/tmp/.yarn-cache,sharing=locked \
 yarn config set network-timeout 600000 \
 && yarn install --frozen-lockfile --prefer-offline --network-timeout 600000 \
 || (echo "▶ yarn install retry 1/2..." && sleep 20 && yarn install --frozen-lockfile --prefer-offline --network-timeout 600000) \
 || (echo "▶ yarn install retry 2/2..." && sleep 40 && yarn install --frozen-lockfile --prefer-offline --network-timeout 600000)

FROM deps AS build
COPY . .
RUN yarn workspace @crm/db generate \
 && yarn workspace @crm/web build

FROM deps AS prod-deps
RUN --mount=type=cache,id=crm-yarn,target=/tmp/.yarn-cache,sharing=locked \
 rm -rf node_modules \
 && yarn install --frozen-lockfile --production=true --ignore-scripts --prefer-offline --network-timeout 600000 \
 || (echo "▶ yarn production install retry 1/2..." && sleep 20 && yarn install --frozen-lockfile --production=true --ignore-scripts --prefer-offline --network-timeout 600000) \
 || (echo "▶ yarn production install retry 2/2..." && sleep 40 && yarn install --frozen-lockfile --production=true --ignore-scripts --prefer-offline --network-timeout 600000)

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RUN_MODE=all
ENV UPLOAD_DIR=/app/uploads
ENV SKIP_DB_PUSH=true
ENV SKIP_INIT_PROD=true
ENV SKIP_MIGRATE_DATA_OWNERS=true
ENV CLEANUP_RECURRING_JOBS=true

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
 --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
 apt-get update -y && apt-get install -y --no-install-recommends ca-certificates openssl \
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
# Schéma Prisma + scripts DB/runtime (db-init, cleanup-recurring-jobs)
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/packages/db/scripts ./packages/db/scripts
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=25s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
