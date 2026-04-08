
CREATE TABLE public.tiktok_videos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tiktok_id text,
  title text NOT NULL,
  thumbnail text,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  duration text,
  author text,
  video_url text,
  source_url text,
  status text DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tiktok videos" ON public.tiktok_videos FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert tiktok videos" ON public.tiktok_videos FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update tiktok videos" ON public.tiktok_videos FOR UPDATE TO public USING (true);
