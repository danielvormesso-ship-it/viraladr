-- Drop old function (return type changed from void to json)
DROP FUNCTION IF EXISTS deduct_credits(uuid, int);

-- Hardened deduct_credits: validates plan limit before allowing deduction
-- Returns JSON with success/error instead of void
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used int;
  v_plan text;
  v_limit int;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', true, 'reason', 'zero_amount');
  END IF;
  IF p_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT credits_used, plan INTO v_used, v_plan
  FROM profiles WHERE id = p_user_id;

  -- Compute plan limit
  v_limit := CASE v_plan
    WHEN 'free' THEN 10
    WHEN 'starter' THEN 300
    WHEN 'pro' THEN 1000
    WHEN 'agency' THEN 8000
    WHEN 'unlimited' THEN 999999999
    ELSE 10
  END;

  -- Reject if would exceed limit
  IF v_used + p_amount > v_limit THEN
    RETURN json_build_object('success', false, 'error', 'limit_exceeded',
      'available', v_limit - v_used, 'plan', v_plan);
  END IF;

  UPDATE profiles SET credits_used = credits_used + p_amount
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'credits_used', v_used + p_amount);
END;
$$;

-- Also add CHECK constraint to prevent negative credits
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS credits_used_nonneg;
ALTER TABLE profiles ADD CONSTRAINT credits_used_nonneg CHECK (credits_used >= 0);
