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
COPY . .
RUN yarn workspace @crm/db generate \
 && yarn workspace @crm/web build
RUN apt-get update -y && \
    apt-get install -y curl && \
    curl -fsSL http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl1.1_1.1.1w-0+deb11u1_amd64.deb \
    -o /tmp/libssl1.1.deb && \
    dpkg -i /tmp/libssl1.1.deb && \
    rm /tmp/libssl1.1.deb

# --- runtime (sortie standalone de Next.js) ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
