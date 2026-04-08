-- Create table for Kwai videos
CREATE TABLE public.kwai_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kwai_id TEXT UNIQUE,
  title TEXT NOT NULL,
  thumbnail TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  duration TEXT,
  author TEXT,
  video_url TEXT,
  source_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'error')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kwai_videos ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth for this app)
CREATE POLICY "Anyone can read videos" ON public.kwai_videos FOR SELECT USING (true);
CREATE POLICY "Anyone can insert videos" ON public.kwai_videos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update videos" ON public.kwai_videos FOR UPDATE USING (true);

-- Indexes
CREATE INDEX idx_kwai_videos_views ON public.kwai_videos (views DESC);
CREATE INDEX idx_kwai_videos_status ON public.kwai_videos (status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_kwai_videos_updated_at
  BEFORE UPDATE ON public.kwai_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();