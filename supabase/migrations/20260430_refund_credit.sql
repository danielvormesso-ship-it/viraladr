-- Refund 1 credit when delivery fails after charge
-- Only allows refund within 5 minutes of charge (safety window)
CREATE OR REPLACE FUNCTION refund_credit(p_user_id uuid, p_tiktok_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN RETURN; END IF;

  UPDATE profiles
     SET credits_used = credits_used - 1
   WHERE id = p_user_id
     AND credits_used > 0;

  DELETE FROM used_videos
   WHERE user_id = p_user_id
     AND tiktok_id = p_tiktok_id
     AND created_at > NOW() - INTERVAL '5 minutes';
END;
$$;
