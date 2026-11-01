# House reserve and liquidity ceiling

## Accounting model

The operator reserve is a separate singleton row in `house_reserve`; it is not a player wallet and is never included in player balance queries. Money is stored in integer KES cents. The initial row is KSH 1,000 (100,000 cents).

At bet placement, the server rejects a stake greater than 5% of the current reserve. The same check is repeated under a database row lock inside the game-engine transaction; the API check is only an early, user-friendly response.

When betting closes, the engine snapshots:
- `maxAllowedPayout = floor(reserve balance × 5%)`
- `totalRoundPool = sum of accepted real-player stakes`
- `maxMultiplier = maxAllowedPayout / totalRoundPool`

The hash-derived crash result is capped at that multiplier. A cap below 1.00x produces a 1.00x instant bust. The existing hash-derived RNG calculation and instant-bust rule are left unchanged so previously published uncapped hash results remain verifiable. The liquidity cap is a separate, deterministic house-risk override and should be disclosed to players.

The reserve amount for a round is held in `reserved_cents` while the round is flying. Admin withdrawals cannot spend this reserved amount. At settlement, the reserve is debited by actual player payouts and credited by uncashed losing stakes. Every seed, admin adjustment, round payout and round loss is recorded in `house_reserve_entries`.

## Database setup

Before deploying this branch, apply `lib/db/migrations/0001_house_reserve.sql` once to the staging Supabase database using the SQL Editor. It is idempotent and creates the singleton reserve with the KSH 1,000 seed. Do not run it against a production-money database as part of this staging change.

## Admin API

All routes require a valid admin JWT:
- `GET /api/admin/house-reserve` — balance, reserved amount, available amount, and current 5% payout ceiling.
- `POST /api/admin/house-reserve/adjust` — JSON body: `{ "action": "deposit" | "withdraw", "amountKes": 100, "description": "..." }`.
- `GET /api/admin/house-reserve/ledger` — latest 100 audit entries.

Withdrawals fail if they exceed the unreserved reserve. These endpoints adjust the reserve ledger only; they do not initiate or verify a real bank/M-Pesa transfer.

## Verification

Run the pure multiplier-cap tests with:

```sh
pnpm --filter @workspace/db test:risk
```

The API and database integration still need a staging test after the SQL migration is applied. Keep M-Pesa in sandbox; do not use real-money bets for verification.
