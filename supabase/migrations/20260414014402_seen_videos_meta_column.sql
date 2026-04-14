-- Add video_meta column for content-based dedup (catches reposts with different tiktok_ids)
-- Format: "author|title_30chars|duration" (normalized, same as frontend getVideoMeta)
ALTER TABLE public.seen_videos ADD COLUMN IF NOT EXISTS video_meta TEXT;

CREATE INDEX IF NOT EXISTS idx_seen_videos_meta
  ON public.seen_videos(user_id, video_meta)
  WHERE video_meta IS NOT NULL;
