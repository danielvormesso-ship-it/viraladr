-- profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  approved boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL USING (auth.role() = 'service_role');

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access roles" ON public.user_roles FOR ALL USING (auth.role() = 'service_role');

-- tiktok_videos table
CREATE TABLE IF NOT EXISTS public.tiktok_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_id text,
  title text,
  thumbnail text,
  views bigint DEFAULT 0,
  likes bigint DEFAULT 0,
  comments bigint DEFAULT 0,
  shares bigint DEFAULT 0,
  duration text,
  author text,
  video_url text,
  source_url text,
  status text DEFAULT 'pending',
  hashtag text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(owner_user_id, tiktok_id),
  UNIQUE(owner_user_id, source_url)
);
ALTER TABLE public.tiktok_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own videos" ON public.tiktok_videos FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own videos" ON public.tiktok_videos FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own videos" ON public.tiktok_videos FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own videos" ON public.tiktok_videos FOR DELETE USING (auth.uid() = owner_user_id);
CREATE POLICY "Service role full access videos" ON public.tiktok_videos FOR ALL USING (auth.role() = 'service_role');

-- hashtag_cache table
CREATE TABLE IF NOT EXISTS public.hashtag_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag text UNIQUE NOT NULL,
  last_scraped_at timestamptz DEFAULT now(),
  videos_found integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.hashtag_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cache" ON public.hashtag_cache FOR SELECT USING (true);
CREATE POLICY "Service role full access cache" ON public.hashtag_cache FOR ALL USING (auth.role() = 'service_role');

-- trending_hashtags table
CREATE TABLE IF NOT EXISTS public.trending_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL,
  category text NOT NULL,
  emoji text DEFAULT '🏷️',
  label text,
  related_tags jsonb DEFAULT '[]',
  popularity_score integer DEFAULT 50,
  last_discovered_at timestamptz DEFAULT now(),
  is_global boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tag, category)
);
ALTER TABLE public.trending_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read trending" ON public.trending_hashtags FOR SELECT USING (true);
CREATE POLICY "Service role full access trending" ON public.trending_hashtags FOR ALL USING (auth.role() = 'service_role');

-- seen_videos table (for dedup across sessions)
CREATE TABLE IF NOT EXISTS public.seen_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tiktok_id text NOT NULL,
  seen_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tiktok_id)
);
ALTER TABLE public.seen_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own seen" ON public.seen_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own seen" ON public.seen_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access seen" ON public.seen_videos FOR ALL USING (auth.role() = 'service_role');

-- Auto-create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create profile for existing admin user
INSERT INTO public.profiles (id, username, display_name)
VALUES ('2bb8379a-2945-48d6-806a-c82cc81d8d15', 'adrianohpg', 'adrianohpg')
ON CONFLICT (id) DO NOTHING;

-- Create admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('2bb8379a-2945-48d6-806a-c82cc81d8d15', 'admin')
ON CONFLICT (user_id) DO NOTHING;
