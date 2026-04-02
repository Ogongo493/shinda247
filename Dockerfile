# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:24-slim AS deps

RUN npm install -g pnpm@10

WORKDIR /app

# Copy manifests first — Docker cache is reused on code-only changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# lib packages
COPY lib/db/package.json                   ./lib/db/
COPY lib/api-zod/package.json              ./lib/api-zod/
COPY lib/api-client-react/package.json     ./lib/api-client-react/
COPY lib/api-spec/package.json             ./lib/api-spec/

# artifacts
COPY artifacts/api-server/package.json     ./artifacts/api-server/
COPY artifacts/shinda/package.json         ./artifacts/shinda/

RUN pnpm install --frozen-lockfile


# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY tsconfig.base.json tsconfig.json ./
COPY lib       ./lib
COPY artifacts ./artifacts
COPY scripts   ./scripts

# Type-check and build all shared libs (drizzle, api-zod, api-client-react)
RUN pnpm run typecheck:libs

# API server — esbuild bundles src/ → artifacts/api-server/dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# Frontend — vite bundles to artifacts/shinda/dist/public
ENV BASE_PATH=/
ENV PORT=5000
RUN pnpm --filter @workspace/shinda run build


# ── Stage 3: lean production image ───────────────────────────────────────────
FROM node:24-slim AS runner

RUN npm install -g pnpm@10

WORKDIR /app

# Manifests for production dep install (no devDeps)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                   ./lib/db/
COPY lib/api-zod/package.json              ./lib/api-zod/
COPY lib/api-client-react/package.json     ./lib/api-client-react/
COPY lib/api-spec/package.json             ./lib/api-spec/
COPY artifacts/api-server/package.json     ./artifacts/api-server/
COPY artifacts/shinda/package.json         ./artifacts/shinda/

RUN pnpm install --frozen-lockfile --prod

# API server bundle
COPY --from=builder /app/artifacts/api-server/dist \
                    ./artifacts/api-server/dist

# Frontend static assets (serve via nginx, CDN, or Express static middleware)
COPY --from=builder /app/artifacts/shinda/dist/public \
                    ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV BASE_PATH=/

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
