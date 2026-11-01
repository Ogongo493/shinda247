CREATE TABLE IF NOT EXISTS game_control (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_paused boolean NOT NULL DEFAULT false,
  reason text,
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO game_control (id, is_paused) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
