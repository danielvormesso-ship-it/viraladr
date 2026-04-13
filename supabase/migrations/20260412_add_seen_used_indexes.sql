-- Índice para query: WHERE user_id = X AND seen_at >= Y (leitura + cleanup)
CREATE INDEX IF NOT EXISTS idx_seen_videos_user_date
  ON public.seen_videos(user_id, seen_at DESC);

-- Índice para query: WHERE user_id = X AND used_at >= Y (leitura + cleanup)
CREATE INDEX IF NOT EXISTS idx_used_videos_user_date
  ON public.used_videos(user_id, used_at DESC);
