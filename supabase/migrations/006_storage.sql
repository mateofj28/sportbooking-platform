-- ============================================================
-- SportBooking — Supabase Storage: buckets y políticas
-- Migración: 006_storage.sql
-- Reemplaza Cloudinary. 3 buckets públicos para lectura.
-- ============================================================

-- ---- Crear buckets ----
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('venues',     'venues',     true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('facilities', 'facilities', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('avatars',    'avatars',    true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- POLÍTICAS DE STORAGE
-- ============================================================

-- ---- Bucket: venues ----
-- Lectura pública (URLs en el frontend para todos)
DROP POLICY IF EXISTS "venues_public_read" ON storage.objects;
CREATE POLICY "venues_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'venues');

-- ADMIN puede subir/actualizar/borrar
DROP POLICY IF EXISTS "venues_admin_insert" ON storage.objects;
CREATE POLICY "venues_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'venues' AND public.is_admin()
  );

DROP POLICY IF EXISTS "venues_admin_update" ON storage.objects;
CREATE POLICY "venues_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'venues' AND public.is_admin()
  );

DROP POLICY IF EXISTS "venues_admin_delete" ON storage.objects;
CREATE POLICY "venues_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'venues' AND public.is_admin()
  );

-- VENUE_ADMIN puede subir/actualizar en su propio complejo
-- (el path del archivo debe incluir el venue_id como prefijo: "venues/{venue_id}/...")
DROP POLICY IF EXISTS "venues_venue_admin_insert" ON storage.objects;
CREATE POLICY "venues_venue_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'venues' AND
    public.is_venue_admin() AND
    (storage.foldername(name))[1] = public.get_my_venue_id()::text
  );

DROP POLICY IF EXISTS "venues_venue_admin_update" ON storage.objects;
CREATE POLICY "venues_venue_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'venues' AND
    public.is_venue_admin() AND
    (storage.foldername(name))[1] = public.get_my_venue_id()::text
  );

-- ---- Bucket: facilities ----
DROP POLICY IF EXISTS "facilities_public_read" ON storage.objects;
CREATE POLICY "facilities_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'facilities');

DROP POLICY IF EXISTS "facilities_admin_write" ON storage.objects;
CREATE POLICY "facilities_admin_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'facilities' AND public.is_admin_or_venue_admin()
  );

DROP POLICY IF EXISTS "facilities_admin_update" ON storage.objects;
CREATE POLICY "facilities_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'facilities' AND public.is_admin_or_venue_admin()
  );

DROP POLICY IF EXISTS "facilities_admin_delete" ON storage.objects;
CREATE POLICY "facilities_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'facilities' AND public.is_admin_or_venue_admin()
  );

-- ---- Bucket: avatars ----
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Cada usuario solo puede subir/actualizar/borrar en su propio path: "avatars/{user_id}/..."
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
