
-- Table to track which videos each user has already seen/received
-- Ensures different users get different videos and same user gets new videos on re-search
CREATE TABLE public.seen_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tiktok_id)
);

-- Enable RLS
ALTER TABLE public.seen_videos ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own seen videos
CREATE POLICY "Users can manage their own seen videos" ON public.seen_videos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups per user
CREATE INDEX idx_seen_videos_user_id ON public.seen_videos(user_id);
