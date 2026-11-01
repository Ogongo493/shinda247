-- Persist each round's reserve hold so crash/restart recovery can release it safely.
ALTER TABLE games ADD COLUMN IF NOT EXISTS risk_ceiling_cents bigint;
