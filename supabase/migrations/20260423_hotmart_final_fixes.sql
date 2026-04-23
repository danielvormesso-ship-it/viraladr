-- 1. RPC: reset monthly credits (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION reset_monthly_credits(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN RETURN; END IF;

  UPDATE profiles
     SET credits_used = 0,
         credits_reset_at = now() + INTERVAL '30 days'
   WHERE id = p_user_id;
END;
$$;

-- 2. Harden deduct_credits: reject negative amounts + only own user
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_amount <= 0 THEN RETURN; END IF;
  IF p_user_id != auth.uid() THEN RETURN; END IF;

  UPDATE profiles
     SET credits_used = credits_used + p_amount
   WHERE id = p_user_id;
END;
$$;

-- 3. Webhook logs table for fraud detection and debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event      TEXT,
  email      TEXT,
  status     TEXT NOT NULL,       -- 'ok', 'unauthorized', 'error', 'pending', 'skipped'
  detail     TEXT,                -- extra info (error message, skipped reason, etc.)
  ip         TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role and admins can read logs
CREATE POLICY "Service role full access webhook_logs"
  ON webhook_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read webhook_logs"
  ON webhook_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
