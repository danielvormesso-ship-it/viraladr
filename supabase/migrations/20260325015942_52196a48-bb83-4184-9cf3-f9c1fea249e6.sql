
INSERT INTO storage.buckets (id, name, public)
VALUES ('editor-assets', 'editor-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload editor assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'editor-assets');

CREATE POLICY "Anyone can read editor assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'editor-assets');

CREATE POLICY "Authenticated users can delete own editor assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'editor-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
