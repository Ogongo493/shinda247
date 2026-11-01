-- Strict account separation, admin MFA/session state, and append-only audit trail.
-- Existing is_admin is retained for backwards compatibility; account_type is authoritative.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type varchar(16) NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS email varchar(254),
  ADD COLUMN IF NOT EXISTS admin_totp_secret_enc text,
  ADD COLUMN IF NOT EXISTS admin_totp_enabled boolean NOT NULL DEFAULT false;

-- Preserve existing administrators exactly as currently represented in the database.
UPDATE users SET account_type = CASE WHEN is_admin THEN 'admin' ELSE 'player' END;

-- The owner explicitly authorized converting the existing Maiko account to admin-only.
-- Keep the account and wallet history; player APIs reject the admin account type.
UPDATE users SET account_type = 'admin', is_admin = true, is_active = false WHERE username = 'Maiko';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
  ON users (lower(email)) WHERE email IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('player', 'admin'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_flag_consistency;
ALTER TABLE users ADD CONSTRAINT users_role_flag_consistency
  CHECK ((account_type = 'admin') = is_admin);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  admin_user_id integer NOT NULL REFERENCES users(id),
  action varchar(120) NOT NULL,
  target_type varchar(80),
  target_id varchar(120),
  outcome varchar(24) NOT NULL DEFAULT 'success',
  ip_address inet,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash char(64),
  entry_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_user_id_idx ON admin_audit_log(admin_user_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_audit_log FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE admin_audit_log_id_seq TO service_role;

-- No update/delete privileges for application roles, including service_role.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE admin_audit_log FROM anon, authenticated, service_role;

-- Database trigger rejects mutation even if privileges are accidentally broadened.
CREATE OR REPLACE FUNCTION reject_admin_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;
DROP TRIGGER IF EXISTS admin_audit_log_immutable ON admin_audit_log;
CREATE TRIGGER admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();

-- Separate server-side admin sessions from player sessions.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_id_idx ON admin_sessions(user_id);
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_sessions FROM anon, authenticated;
GRANT ALL ON TABLE admin_sessions TO service_role;

-- One-time MFA challenges are short-lived and stored as hashes, never plaintext codes.
CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_mfa_challenges_user_id_idx ON admin_mfa_challenges(user_id);
ALTER TABLE admin_mfa_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_mfa_challenges FROM anon, authenticated;
GRANT ALL ON TABLE admin_mfa_challenges TO service_role;

-- Enforce admin/player separation below the API as well. Existing history is
-- retained, but an administrator cannot create or mutate player wallet,
-- transaction, or wager records through another server path.
CREATE OR REPLACE FUNCTION reject_admin_player_financial_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_user_id integer;
BEGIN
  target_user_id := NEW.user_id;
  IF target_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM users WHERE id = target_user_id AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator accounts cannot use player financial or betting records';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_reject_admin_activity ON wallets;
CREATE TRIGGER wallets_reject_admin_activity
  BEFORE INSERT OR UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION reject_admin_player_financial_activity();

DROP TRIGGER IF EXISTS transactions_reject_admin_activity ON transactions;
CREATE TRIGGER transactions_reject_admin_activity
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION reject_admin_player_financial_activity();

DROP TRIGGER IF EXISTS bets_reject_admin_activity ON bets;
CREATE TRIGGER bets_reject_admin_activity
  BEFORE INSERT OR UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION reject_admin_player_financial_activity();
