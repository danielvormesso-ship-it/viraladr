
-- Cache table to track when hashtags were last scraped
CREATE TABLE public.hashtag_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag text NOT NULL UNIQUE,
  last_scraped_at timestamp with time zone NOT NULL DEFAULT now(),
  videos_found integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.hashtag_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hashtag cache" ON public.hashtag_cache FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert hashtag cache" ON public.hashtag_cache FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update hashtag cache" ON public.hashtag_cache FOR UPDATE TO public USING (true);

-- Track which videos were assigned/downloaded by each editor
CREATE TABLE public.video_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.tiktok_videos(id) ON DELETE CASCADE,
  editor_name text NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(video_id, editor_name)
);

ALTER TABLE public.video_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read assignments" ON public.video_assignments FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert assignments" ON public.video_assignments FOR INSERT TO public WITH CHECK (true);
