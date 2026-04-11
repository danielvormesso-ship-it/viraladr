CREATE TABLE IF NOT EXISTS public.used_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_id text NOT NULL,
  used_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tiktok_id)
);
CREATE INDEX IF NOT EXISTS idx_used_videos_tiktok_id ON public.used_videos(tiktok_id);
CREATE INDEX IF NOT EXISTS idx_used_videos_user_id ON public.used_videos(user_id);
ALTER TABLE public.used_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own used" ON public.used_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own used" ON public.used_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access used" ON public.used_videos FOR ALL USING (auth.role() = 'service_role');
