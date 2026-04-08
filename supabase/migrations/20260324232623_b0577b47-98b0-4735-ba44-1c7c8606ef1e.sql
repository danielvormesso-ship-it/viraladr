ALTER TABLE public.tiktok_videos DROP CONSTRAINT IF EXISTS tiktok_videos_tiktok_id_key;
DROP INDEX IF EXISTS public.tiktok_videos_tiktok_id_unique;