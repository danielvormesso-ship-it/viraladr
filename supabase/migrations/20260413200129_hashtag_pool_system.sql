-- ============================================================
-- Pool Inteligente por Hashtag — Migração
-- ============================================================

-- 1. hashtag_pool: vídeos pré-buscados e filtrados, prontos para servir
CREATE TABLE IF NOT EXISTS public.hashtag_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_group TEXT NOT NULL,
  tiktok_id TEXT NOT NULL,
  title TEXT,
  thumbnail TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  duration TEXT,
  author TEXT,
  video_url TEXT,
  source_url TEXT,
  source_hashtag TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  br_score SMALLINT DEFAULT 1,
  niche_approved BOOLEAN DEFAULT NULL,
  UNIQUE(hashtag_group, tiktok_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_serve
  ON public.hashtag_pool(hashtag_group, niche_approved, fetched_at DESC)
  WHERE niche_approved = true;

CREATE INDEX IF NOT EXISTS idx_pool_tiktok_id
  ON public.hashtag_pool(tiktok_id);

CREATE INDEX IF NOT EXISTS idx_pool_cleanup
  ON public.hashtag_pool(fetched_at);

ALTER TABLE public.hashtag_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access pool"
  ON public.hashtag_pool FOR ALL
  USING (auth.role() = 'service_role');

-- 2. editor_hashtag_stats: tracking de uso por editor/grupo
CREATE TABLE IF NOT EXISTS public.editor_hashtag_stats (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hashtag_group TEXT NOT NULL,
  search_count INT DEFAULT 0,
  last_searched_at TIMESTAMPTZ,
  avg_quantity INT DEFAULT 50,
  pool_hit_rate FLOAT DEFAULT 0,
  PRIMARY KEY(user_id, hashtag_group)
);

CREATE INDEX IF NOT EXISTS idx_editor_stats_active
  ON public.editor_hashtag_stats(last_searched_at DESC)
  WHERE search_count > 0;

ALTER TABLE public.editor_hashtag_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own stats"
  ON public.editor_hashtag_stats FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role full access stats"
  ON public.editor_hashtag_stats FOR ALL
  USING (auth.role() = 'service_role');

-- 3. pool_cursors: cursores de paginação TikWM separados do frontend
CREATE TABLE IF NOT EXISTS public.pool_cursors (
  hashtag_group TEXT NOT NULL,
  sub_hashtag TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  exhausted BOOLEAN DEFAULT false,
  PRIMARY KEY(hashtag_group, sub_hashtag)
);

ALTER TABLE public.pool_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access cursors"
  ON public.pool_cursors FOR ALL
  USING (auth.role() = 'service_role');
