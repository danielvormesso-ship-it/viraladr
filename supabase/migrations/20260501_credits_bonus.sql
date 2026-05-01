-- Add credits_bonus column for upgrade carryover
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_bonus integer DEFAULT 0;

-- Update deduct_credits to account for bonus credits
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_used int;
  v_bonus int;
  v_plan text;
  v_limit int;
  v_total_available int;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT credits_used, COALESCE(credits_bonus, 0), plan INTO v_used, v_bonus, v_plan
  FROM profiles WHERE id = p_user_id;

  v_limit := CASE v_plan
    WHEN 'free' THEN 10
    WHEN 'starter' THEN 300
    WHEN 'pro' THEN 1000
    WHEN 'agency' THEN 8000
    WHEN 'unlimited' THEN 999999
    ELSE 10
  END;

  v_total_available := v_limit + v_bonus - v_used;

  IF v_total_available < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'limit_exceeded',
      'available', v_total_available, 'plan', v_plan);
  END IF;

  UPDATE profiles SET credits_used = credits_used + p_amount
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'credits_used', v_used + p_amount);
END;
$$;
