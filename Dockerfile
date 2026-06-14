# Alias de docker/Dockerfile.app — web + worker (RUN_MODE=all par défaut).
#   docker build -t crm-app .
# Voir aussi apps/web/Dockerfile et apps/worker/Dockerfile (identiques).
#
# Au démarrage (ENTRYPOINT) : db push → init-prod → migrate-data-owners --apply
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
# Réseau VPS/Dokploy : IPv4 prioritaire + timeouts yarn élevés (évite ESOCKETTIMEDOUT npm).
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

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RUN_MODE=all
ENV UPLOAD_DIR=/app/uploads

RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/uploads

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/node_modules ./node_modules
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
