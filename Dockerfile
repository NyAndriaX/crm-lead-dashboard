# Alias de docker/Dockerfile.app — web + worker (RUN_MODE=all par défaut).
#   docker build -t crm-app .
# Voir aussi apps/web/Dockerfile et apps/worker/Dockerfile (identiques).
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn install --frozen-lockfile

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

RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/yarn.lock ./yarn.lock
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=25s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
