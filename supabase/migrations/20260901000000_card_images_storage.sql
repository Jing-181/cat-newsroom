-- 卡片图片上传桶：公开读取，正式账号只能写自己的目录。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-images', 'card-images', true, 6291456, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "card_images_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "card_images_select_own" ON storage.objects;
DROP POLICY IF EXISTS "card_images_update_own" ON storage.objects;
DROP POLICY IF EXISTS "card_images_delete_own" ON storage.objects;

CREATE POLICY "card_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "card_images_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

CREATE POLICY "card_images_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  WITH CHECK (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "card_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
