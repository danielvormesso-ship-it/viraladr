-- Add email and phone columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update trigger to save email from auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $body$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, approved, email, phone)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'username',
    false,
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    phone = COALESCE(EXCLUDED.phone, profiles.phone);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'editor')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;
