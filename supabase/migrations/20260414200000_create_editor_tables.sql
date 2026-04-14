-- editor_configs: stores per-user editor configuration (popup timing, volumes, effects etc.)
CREATE TABLE IF NOT EXISTS editor_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE editor_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own config"
  ON editor_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own config"
  ON editor_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own config"
  ON editor_configs FOR UPDATE USING (auth.uid() = user_id);

-- editor_templates: stores saved editor presets (popup + audio + config)
CREATE TABLE IF NOT EXISTS editor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  popup_file_path TEXT,
  popup_media_type TEXT,
  audio_file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE editor_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own templates"
  ON editor_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates"
  ON editor_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates"
  ON editor_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates"
  ON editor_templates FOR DELETE USING (auth.uid() = user_id);
