FROM node:20-slim

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/db/package.json ./artifacts/db/

RUN pnpm install --frozen-lockfile --filter @workspace/api-server --filter @workspace/db

COPY artifacts/db ./artifacts/db
COPY artifacts/api-server ./artifacts/api-server

RUN pnpm --filter @workspace/db run build 2>/dev/null || true
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.js"]
