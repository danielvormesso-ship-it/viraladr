
CREATE TABLE public.editor_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  popup_file_path text,
  popup_media_type text DEFAULT 'image',
  audio_file_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.editor_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own templates" ON public.editor_templates
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates" ON public.editor_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates" ON public.editor_templates
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates" ON public.editor_templates
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
