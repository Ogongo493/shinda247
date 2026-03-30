# Shinda 24/7 — Rocket Crash Game

A real-time "Rocket Crash" gambling game (inspired by Pakakumi) with a dark space-themed interface. Players place bets and must cash out before the rocket crashes to win.

## Architecture

**Monorepo** managed with `pnpm` workspaces (TypeScript throughout).

### Packages
- `artifacts/api-server` — Express 5 backend, Socket.io real-time, game logic, M-Pesa integration
- `artifacts/shinda` — React 19 + Vite frontend (game UI)
- `lib/db` — Drizzle ORM + PostgreSQL, schema, wallet/RNG/game-engine services
- `lib/api-spec` — OpenAPI 3.1 spec + Orval codegen config
- `lib/api-client-react` — Auto-generated TanStack Query hooks
- `lib/api-zod` — Auto-generated Zod schemas

### Tech Stack
- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Framer Motion, Radix UI, Wouter, TanStack Query
- **Backend**: Node.js 24, Express 5, Socket.io, Pino logging
- **Database**: PostgreSQL (Replit built-in) with Drizzle ORM
- **Auth**: Custom JWT (HS256, 7-day expiry) via `lib/jwt.ts`
- **Payments**: Safaricom Daraja API (M-Pesa STK Push + B2C) — gracefully mocked when credentials absent
- **RNG**: SHA256 hash chain (provably fair)

## Workflows

- **Backend API** → `PORT=3000 pnpm --filter @workspace/api-server run dev`
  - Builds with esbuild (`build.mjs`), starts from `dist/index.mjs`
  - Listens on port 3000
- **Start application** → `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/shinda run dev`
  - Vite dev server on port 5000
  - Proxies `/api` and `/socket.io` to localhost:3000

## Environment Variables / Secrets

- `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — Replit PostgreSQL (auto-provisioned)
- `SESSION_SECRET` — set
- `JWT_SECRET` — optional, defaults to dev secret (set for production)
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_BASE_URL`, `MPESA_ENVIRONMENT` — optional, falls back to mock mode

## Database

Schema pushed via Drizzle: `pnpm --filter @workspace/db run push`

Tables: users, wallets, games, game bets (see `lib/db/src/schema/`)

## Deployment

Build command: `pnpm install && pnpm --filter @workspace/db run push && pnpm --filter @workspace/api-server run build && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/shinda run build`

Run command: `PORT=3000 node --enable-source-maps artifacts/api-server/dist/index.mjs & PORT=5000 BASE_PATH=/ pnpm --filter @workspace/shinda run serve`
