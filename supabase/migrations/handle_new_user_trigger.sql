-- Auto-create profile and editor role on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $body$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, approved)
  VALUES (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'username', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'editor')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
