CREATE TABLE IF NOT EXISTS public.editor_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.editor_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own activity" ON public.editor_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity" ON public.editor_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access activity" ON public.editor_activity FOR ALL USING (auth.role() = 'service_role');
