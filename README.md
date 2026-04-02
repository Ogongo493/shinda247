<div align="center">

# 🚀 Shinda 24/7

**Real-time Rocket Crash Game — built for the Kenyan market**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle_ORM-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)
[![M-Pesa](https://img.shields.io/badge/M--Pesa-Daraja_API-00A651?style=flat-square)](https://developer.safaricom.co.ke/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

Players place bets, watch the multiplier climb, and cash out before the rocket crashes.  
Built with a provably fair SHA-256 hash chain and real M-Pesa KES payments.

</div>

---

## ✨ Features

| Category | Details |
|---|---|
| **Game Engine** | 4-phase loop: `waiting → betting → flying → crashed`; 150 ms tick broadcaster |
| **Provably Fair RNG** | SHA-256 hash chain — every crash point verifiable on-chain |
| **Real-time** | Socket.io broadcasts with 60 fps client-side multiplier interpolation |
| **Payments** | M-Pesa STK Push deposits + B2C withdrawals via Safaricom Daraja API |
| **Auth** | Phone + SMS OTP registration/login, HS256 JWT (7-day expiry) |
| **Wallet** | Atomic `SELECT FOR UPDATE` transactions — no double-spend under concurrency |
| **Crash Recovery** | Server restart auto-refunds all open bets from any interrupted game |
| **Bot Simulator** | UI-only fake players keep the live-bet feed alive during low traffic |
| **Admin Panel** | Player management, transaction ledger, game history, toggle active/admin |
| **Docker** | Multi-stage build — lean production image with separate API + static serving |

---

## 🏗 Architecture

```
shinda247/
├── artifacts/
│   ├── api-server/          # Express 5 + Socket.io backend
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── gameEngine.ts    # Socket.io bridge → DB engine
│   │       │   ├── botSimulator.ts  # UI-only fake players
│   │       │   ├── daraja.ts        # M-Pesa STK Push + B2C
│   │       │   ├── jwt.ts           # HS256 sign/verify
│   │       │   └── sms.ts           # Africa's Talking OTP
│   │       └── routes/
│   │           ├── auth.ts          # /register /login /verify-otp /me
│   │           ├── game.ts          # /game/state /game/bet /game/cashout
│   │           ├── mpesa.ts         # /deposit /withdraw /callback
│   │           └── admin.ts         # /stats /players /transactions /games
│   └── shinda/              # React 19 + Vite 7 frontend
│       └── src/
│           ├── contexts/
│           │   ├── rtdb-context.tsx  # Socket.io state + live bets
│           │   └── auth-context.tsx  # JWT storage + session
│           ├── components/game/      # Canvas, controls, history panel
│           └── pages/               # home, history, players, admin, …
├── lib/
│   ├── db/                  # Drizzle ORM — schema, engine, wallet, RNG
│   │   └── src/services/
│   │       ├── game.engine.ts   # Production game loop (the real engine)
│   │       ├── wallet.service.ts # creditWallet / debitWallet (FOR UPDATE)
│   │       └── rng.service.ts   # SHA-256 hash chain + crash point math
│   ├── api-spec/            # OpenAPI 3.1 spec
│   ├── api-client-react/    # Auto-generated TanStack Query hooks (orval)
│   └── api-zod/             # Auto-generated Zod request/response schemas
└── scripts/
```

### Data flow

```
Browser ──ws──▶ Socket.io ──▶ gameEngine.ts (bridge)
                                    │
                         setBroadcast() fan-out
                                    │
                              game.engine.ts  ◀──▶  PostgreSQL
                                    │                (FOR UPDATE)
                    ┌───────────────┼───────────────┐
                 1501            1502–1503         1504–1507
              new round          tick/fly        crash/bet/cashout
                    │               │                │
              game:newRound    game:state        game:crash
                                                game:bet
                                                game:cashout
                                    │
                              React rtdb-context
                              60fps RAF loop
```

---

## 🗄 Database Schema

| Table | Purpose |
|---|---|
| `users` | Phone-verified player accounts |
| `wallets` | Balance ledger with `locked_cents` for in-flight bets |
| `transactions` | Full audit trail: deposits, withdrawals, bets, wins, refunds |
| `mpesa_callbacks` | Idempotent Daraja callback log (deduplication by `mpesa_ref`) |
| `otp_codes` | Time-limited 6-digit OTP with attempt counter |
| `sessions` | JWT session tokens |
| `games` | Every round: hash, state, crash point, timing, totals |
| `bets` | Per-player bet: amount, auto-cashout, payout, state |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 24+
- pnpm 10+
- PostgreSQL 15+ (or use [Replit](https://replit.com) which auto-provisions one)

### 1. Clone and install

```bash
git clone https://github.com/Ogongo493/shinda247.git
cd shinda247
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET
```

### 3. Push the database schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Start development servers

```bash
# Terminal 1 — API server (port 3000)
PORT=3000 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 5000, proxies /api and /socket.io to :3000)
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/shinda run dev
```

Open **http://localhost:5000** — register with any Kenyan phone number format (`07xxxxxxxx`). OTP is logged to the API server console when `AFRICASTALKING_API_KEY` is not set.

---

## 🐳 Docker

```bash
docker build -t shinda247 .

docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/shinda247 \
  -e JWT_SECRET=your-secret-here \
  shinda247
```

The container serves the API on port 8080. The built frontend assets are copied to `/app/public` — point nginx or a CDN at that directory, or mount it as a static path in Express.

---

## 💳 M-Pesa Integration

Shinda 24/7 uses the [Safaricom Daraja API](https://developer.safaricom.co.ke/):

| Flow | Endpoint | Description |
|---|---|---|
| Deposit | `POST /api/mpesa/deposit` | Triggers STK Push to player's phone |
| Callback | `POST /api/mpesa/callback` | Safaricom posts payment confirmation — credits wallet atomically |
| Withdraw | `POST /api/mpesa/withdraw` | Initiates B2C transfer to player's phone |

**Development mode:** when `MPESA_CONSUMER_KEY` is not set, all payment calls return mock success responses and are logged to the console — no real money moves.

---

## 🎲 Provably Fair RNG

Each game round uses a SHA-256 hash chain:

```
genesis_seed → hash_N → hash_N-1 → … → hash_1
```

The crash point for round `N` is deterministically derived from `hash_N`:

```
h = parseInt(hash[0..7], 16)
if h % 33 === 0  →  crash at 1.00x  (house instant win)
else             →  crash = floor((100 × 2³²− h) / (2³² − h)) / 100
```

Players can independently verify any past round by checking `hash_N` against the published `gameHash` and rerunning the formula. The full implementation is in [`lib/db/src/services/rng.service.ts`](lib/db/src/services/rng.service.ts).

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9 |
| API | Express 5, Socket.io 4, Pino logging |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Framer Motion, Radix UI, Wouter |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Custom HS256 JWT, Africa's Talking SMS OTP |
| Payments | Safaricom Daraja (M-Pesa STK Push + B2C) |
| Codegen | Orval → TanStack Query hooks + Zod schemas from OpenAPI 3.1 |
| Package mgr | pnpm workspaces (monorepo) |
| Build | esbuild (API), Vite (frontend) |
| Container | Docker multi-stage build |

---

## 📁 Environment Variables

See [`.env.example`](.env.example) for a fully-documented list of every variable.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | dev fallback | JWT signing secret |
| `PORT` | ✅ | — | API server port |
| `MPESA_CONSUMER_KEY` | ☑️ prod | — | Daraja app key |
| `MPESA_CONSUMER_SECRET` | ☑️ prod | — | Daraja app secret |
| `MPESA_CALLBACK_BASE_URL` | ☑️ prod | — | Public HTTPS URL for Daraja callbacks |
| `AFRICASTALKING_API_KEY` | ☑️ prod | — | SMS OTP delivery |

---

## 📜 License

MIT © 2025 Ogongo493
