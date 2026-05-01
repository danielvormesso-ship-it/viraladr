CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

-- No direct access — only service_role via edge functions
CREATE POLICY "no_direct_access" ON password_resets FOR ALL USING (false);
