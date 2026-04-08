
-- Table for storing discovered/trending hashtags with categories
CREATE TABLE public.trending_hashtags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  emoji TEXT DEFAULT '🏷️',
  label TEXT NOT NULL,
  related_tags TEXT[] DEFAULT '{}',
  popularity_score INTEGER DEFAULT 0,
  last_discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  discovered_by UUID REFERENCES auth.users(id),
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tag, category)
);

-- Enable RLS
ALTER TABLE public.trending_hashtags ENABLE ROW LEVEL SECURITY;

-- Everyone can read trending hashtags
CREATE POLICY "Anyone can read trending hashtags" ON public.trending_hashtags
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert trending hashtags" ON public.trending_hashtags
  FOR INSERT TO authenticated WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update trending hashtags" ON public.trending_hashtags
  FOR UPDATE TO authenticated USING (true);
