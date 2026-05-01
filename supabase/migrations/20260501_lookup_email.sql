CREATE OR REPLACE FUNCTION lookup_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM profiles
  WHERE username = p_username
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION lookup_email_by_username(text) TO authenticated;
