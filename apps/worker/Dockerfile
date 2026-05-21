# Worker — process Node.js qui poll la collection `jobs` (pas de Redis).
# Exécuté via tsx (pas d'étape de build) ; le client Prisma de @crm/db doit être généré.
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
COPY . .
RUN yarn workspace @crm/db generate

FROM build AS runtime
ENV NODE_ENV=production
CMD ["sh", "-c", "yarn workspace @crm/db init-prod && yarn workspace @crm/worker start"]
