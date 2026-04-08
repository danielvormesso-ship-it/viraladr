
CREATE TABLE public.editor_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.editor_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own config" ON public.editor_configs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own config" ON public.editor_configs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config" ON public.editor_configs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
