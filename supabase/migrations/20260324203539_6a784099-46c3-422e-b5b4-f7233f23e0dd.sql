
-- Remove duplicate tiktok_videos keeping the one with highest views
DELETE FROM public.tiktok_videos a
USING public.tiktok_videos b
WHERE a.tiktok_id IS NOT NULL
  AND a.tiktok_id = b.tiktok_id
  AND a.id <> b.id
  AND (a.views < b.views OR (a.views = b.views AND a.created_at > b.created_at));

-- Add unique constraint on tiktok_id (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_videos_tiktok_id_unique ON public.tiktok_videos (tiktok_id) WHERE tiktok_id IS NOT NULL;
