-- 1. Atomic credit deduction RPC
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
     SET credits_used = credits_used + p_amount
   WHERE id = p_user_id;
END;
$$;

-- 2. Pending plans table for purchases before account creation
CREATE TABLE IF NOT EXISTS pending_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  plan       TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  product_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pending_plans ADD CONSTRAINT pending_plans_email_key UNIQUE (email);
CREATE INDEX IF NOT EXISTS idx_pending_plans_email ON pending_plans(email);

ALTER TABLE pending_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access pending_plans"
  ON pending_plans FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Activate pending plan on new user signup
CREATE OR REPLACE FUNCTION activate_pending_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending RECORD;
BEGIN
  SELECT * INTO v_pending
    FROM pending_plans
   WHERE email = NEW.email
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE profiles
       SET plan = v_pending.plan,
           credits_used = 0,
           credits_reset_at = now() + INTERVAL '30 days'
     WHERE id = NEW.id;

    DELETE FROM pending_plans WHERE email = NEW.email;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS trg_activate_pending_plan ON profiles;
CREATE TRIGGER trg_activate_pending_plan
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION activate_pending_plan();

-- 4. Restrict users from updating plan/credits fields directly
-- Drop the permissive update policy
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate with column restriction: users can only update display fields
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND plan = (SELECT p.plan FROM profiles p WHERE p.id = auth.uid())
    AND credits_used = (SELECT p.credits_used FROM profiles p WHERE p.id = auth.uid())
  );
