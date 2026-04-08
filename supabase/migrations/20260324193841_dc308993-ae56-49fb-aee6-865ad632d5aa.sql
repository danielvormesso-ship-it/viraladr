-- Add approval column to profiles
ALTER TABLE public.profiles ADD COLUMN approved boolean NOT NULL DEFAULT false;

-- Activity tracking table
CREATE TABLE public.editor_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL, -- 'search', 'download', 'filter', 'batch_download'
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.editor_activity ENABLE ROW LEVEL SECURITY;

-- Editors can insert their own activity
CREATE POLICY "Users can insert own activity" ON public.editor_activity
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Editors can read own activity
CREATE POLICY "Users can read own activity" ON public.editor_activity
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can read all activity
CREATE POLICY "Admins can read all activity" ON public.editor_activity
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update profiles (for approval)
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-approve admin users via trigger update
CREATE OR REPLACE FUNCTION public.auto_approve_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin') THEN
    UPDATE public.profiles SET approved = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Set existing admin as approved
UPDATE public.profiles SET approved = true WHERE id IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
);

-- Enable realtime for activity
ALTER PUBLICATION supabase_realtime ADD TABLE public.editor_activity;