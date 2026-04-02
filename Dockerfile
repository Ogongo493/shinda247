# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:24-slim AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy the entire workspace (node_modules and dist excluded via .dockerignore)
COPY . .

RUN pnpm install --frozen-lockfile


# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

ARG CACHE_BUST=3

# Build shared libs
RUN pnpm run typecheck:libs

# API server — esbuild → artifacts/api-server/dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# Frontend — vite → artifacts/shinda/dist/public
ENV BASE_PATH=/
ENV PORT=5000
RUN pnpm --filter @workspace/shinda run build


# ── Stage 3: lean production image ───────────────────────────────────────────
FROM node:24-slim AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace manifests and install production deps only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                   ./lib/db/
COPY lib/api-zod/package.json              ./lib/api-zod/
COPY lib/api-client-react/package.json     ./lib/api-client-react/
COPY lib/api-spec/package.json             ./lib/api-spec/
COPY artifacts/api-server/package.json     ./artifacts/api-server/
COPY artifacts/shinda/package.json         ./artifacts/shinda/
COPY scripts/package.json                  ./scripts/

RUN pnpm install --frozen-lockfile --prod

# Compiled outputs from builder
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/shinda/dist/public ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV BASE_PATH=/

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
