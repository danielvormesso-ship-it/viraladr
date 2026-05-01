-- Allow user to delete their own account (LGPD Art. 18)
-- Deletes profile, used_videos, seen_videos, editor_activity
-- Auth user deletion must be handled by admin API separately
CREATE OR REPLACE FUNCTION delete_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN RETURN; END IF;

  -- Delete user data from all tables
  DELETE FROM used_videos WHERE user_id = p_user_id;
  DELETE FROM seen_videos WHERE user_id = p_user_id;
  DELETE FROM editor_activity WHERE user_id = p_user_id;
  DELETE FROM tiktok_videos WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
