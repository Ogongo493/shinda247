CREATE TABLE IF NOT EXISTS game_control (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_paused boolean NOT NULL DEFAULT false,
  reason text,
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- This table is managed only by the trusted application backend.
ALTER TABLE game_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE game_control FROM anon, authenticated;
GRANT ALL ON TABLE game_control TO service_role;

INSERT INTO game_control (id, is_paused) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
