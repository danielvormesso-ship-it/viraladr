DROP INDEX IF EXISTS public.uq_tiktok_videos_owner_tiktok_id;
DROP INDEX IF EXISTS public.uq_tiktok_videos_owner_source_url;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tiktok_videos_owner_tiktok_id
ON public.tiktok_videos (owner_user_id, tiktok_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tiktok_videos_owner_source_url
ON public.tiktok_videos (owner_user_id, source_url);