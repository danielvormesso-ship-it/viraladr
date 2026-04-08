ALTER TABLE public.tiktok_videos
ADD COLUMN IF NOT EXISTS owner_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_tiktok_videos_owner_user_id
ON public.tiktok_videos (owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tiktok_videos_owner_tiktok_id
ON public.tiktok_videos (owner_user_id, tiktok_id)
WHERE tiktok_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tiktok_videos_owner_source_url
ON public.tiktok_videos (owner_user_id, source_url)
WHERE source_url IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can read tiktok videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Anyone can insert tiktok videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Anyone can update tiktok videos" ON public.tiktok_videos;
DROP POLICY IF EXISTS "Anyone can delete tiktok videos" ON public.tiktok_videos;

CREATE POLICY "Users can read own tiktok videos"
ON public.tiktok_videos
FOR SELECT
TO authenticated
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can insert own tiktok videos"
ON public.tiktok_videos
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own tiktok videos"
ON public.tiktok_videos
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete own tiktok videos"
ON public.tiktok_videos
FOR DELETE
TO authenticated
USING (auth.uid() = owner_user_id);