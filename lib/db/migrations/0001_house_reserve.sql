-- Apply once to the staging Supabase database before deploying this branch.
-- The seed is isolated from player wallets and is inserted only when absent.
DO $$ BEGIN
  CREATE TYPE house_reserve_entry_type AS ENUM (
    'seed', 'admin_deposit', 'admin_withdrawal', 'round_losses', 'round_payout'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS house_reserve (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_cents bigint NOT NULL DEFAULT 100000,
  reserved_cents bigint NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'KSH',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT house_reserve_nonnegative_balance CHECK (balance_cents >= 0),
  CONSTRAINT house_reserve_nonnegative_reserved CHECK (reserved_cents >= 0)
);

INSERT INTO house_reserve (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS house_reserve_entries (
  id serial PRIMARY KEY,
  type house_reserve_entry_type NOT NULL,
  amount_cents bigint NOT NULL,
  balance_before_cents bigint NOT NULL,
  balance_after_cents bigint NOT NULL,
  admin_user_id integer REFERENCES users(id),
  game_id integer REFERENCES games(id),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_reserve_entries_created_at_idx
  ON house_reserve_entries (created_at DESC);

-- Seed audit entry exactly once for the initial KES 1,000 reserve.
INSERT INTO house_reserve_entries (
  type, amount_cents, balance_before_cents, balance_after_cents, description
)
SELECT 'seed', 100000, 0, 100000, 'Initial KES 1,000 house reserve seed'
WHERE NOT EXISTS (
  SELECT 1 FROM house_reserve_entries WHERE type = 'seed'
);
