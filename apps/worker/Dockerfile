# ─── CRM Worker — polling MySQL (table Job) ─────────────────────
# Build autonome, déployable sans docker-compose.
# Variables requises au runtime : DATABASE_URL, PII_ENCRYPTION_KEY, EMAIL_HASH_SECRET, etc.
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
RUN yarn install --frozen-lockfile

# --- build : générer le client Prisma ---
FROM deps AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN yarn workspace @crm/db generate

# --- runtime ---
FROM build AS runtime
ENV NODE_ENV=production

HEALTHCHECK --interval=60s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "try{require('net').createConnection({port:3306,host:process.env.DATABASE_URL?.match(/@([^:\/]+)/)?.[1]||'localhost'}).on('connect',()=>{process.exit(0)}).on('error',()=>{process.exit(1)})}catch{process.exit(1)}"

CMD ["yarn", "workspace", "@crm/worker", "start"]
