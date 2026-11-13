-- SportBooking — La publicidad es una IMAGEN (banner diseñado por el anunciante)
-- Migración: 042_ads_as_images.sql
--
-- Antes: el anuncio era texto (título, subtítulo, descripción, color, botón) y la app
-- dibujaba el banner. Ahora es una imagen: una para computadora (obligatoria) y otra
-- para celular (opcional; si falta se usa la de computadora).
--
--   * title       -> nombre interno (para reconocerla en el panel).
--   * alt_text    -> qué dice la imagen (lectores de pantalla). Obligatorio.
--   * image_url / image_mobile_url -> solo URLs públicas del bucket "ads" de este
--     proyecto (no se aceptan imágenes externas: evita contenido o rastreadores ajenos).
--   * Se quitan subtitle, description, theme y cta_label.
--
-- Las 4 publicidades de texto existentes eran de prueba y se borran (pedido del dueño).
-- ============================================================

-- 1. Borrar las publicidades de texto (de prueba)
DELETE FROM public.advertisements;

-- 2. Columnas: fuera las de texto, entran las de imagen
ALTER TABLE public.advertisements
  DROP CONSTRAINT IF EXISTS ads_subtitle_len,
  DROP CONSTRAINT IF EXISTS ads_description_len,
  DROP CONSTRAINT IF EXISTS ads_theme_valid,
  DROP CONSTRAINT IF EXISTS ads_cta_len;

ALTER TABLE public.advertisements
  DROP COLUMN IF EXISTS subtitle,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS theme,
  DROP COLUMN IF EXISTS cta_label;

ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS alt_text         text NOT NULL,
  ADD COLUMN IF NOT EXISTS image_url        text NOT NULL,
  ADD COLUMN IF NOT EXISTS image_mobile_url text;

ALTER TABLE public.advertisements
  ADD CONSTRAINT ads_alt_len CHECK (char_length(alt_text) BETWEEN 1 AND 150),
  ADD CONSTRAINT ads_image_url_valid CHECK (
    image_url ~ '^https://olrmhtimfndshayvuowc\.supabase\.co/storage/v1/object/public/ads/[^[:space:]]+$'
    AND char_length(image_url) <= 500
  ),
  ADD CONSTRAINT ads_image_mobile_url_valid CHECK (
    image_mobile_url IS NULL OR (
      image_mobile_url ~ '^https://olrmhtimfndshayvuowc\.supabase\.co/storage/v1/object/public/ads/[^[:space:]]+$'
      AND char_length(image_mobile_url) <= 500
    )
  );

COMMENT ON COLUMN public.advertisements.title IS 'Nombre interno (solo panel)';
COMMENT ON COLUMN public.advertisements.alt_text IS 'Texto alternativo: qué dice la imagen';
COMMENT ON COLUMN public.advertisements.image_url IS 'Banner para computadora (bucket ads)';
COMMENT ON COLUMN public.advertisements.image_mobile_url IS 'Banner para celular (opcional, bucket ads)';

-- 3. Normalización (sin los campos de texto que ya no existen)
CREATE OR REPLACE FUNCTION public.normalize_advertisement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unknown text;
BEGIN
  NEW.title            := btrim(NEW.title);
  NEW.alt_text         := btrim(NEW.alt_text);
  NEW.image_url        := btrim(NEW.image_url);
  NEW.image_mobile_url := NULLIF(btrim(NEW.image_mobile_url), '');
  NEW.link_url         := NULLIF(btrim(NEW.link_url), '');
  NEW.localities  := COALESCE(
    ARRAY(SELECT DISTINCT btrim(l) FROM unnest(NEW.localities) AS l WHERE btrim(l) <> '' ORDER BY 1),
    '{}'
  );

  SELECT l INTO v_unknown
  FROM unnest(NEW.localities) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.ar_localities a WHERE a.code = l)
  LIMIT 1;
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Municipio desconocido: %', v_unknown USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Lo que ve el cliente: la imagen, su texto alternativo y el link
DROP FUNCTION IF EXISTS public.get_active_advertisements(text);
CREATE FUNCTION public.get_active_advertisements(p_locality text DEFAULT NULL)
RETURNS TABLE (
  id               uuid,
  alt_text         text,
  image_url        text,
  image_mobile_url text,
  link_url         text,
  scope            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    -- Solo códigos reales del catálogo; cualquier otro valor = "sin municipio" (solo nacionales)
    SELECT (SELECT a.code FROM public.ar_localities a WHERE a.code = btrim(p_locality)) AS locality
  )
  SELECT a.id, a.alt_text, a.image_url, a.image_mobile_url, a.link_url, a.scope
  FROM public.advertisements a
  CROSS JOIN ctx
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at   IS NULL OR a.ends_at   >  now())
    AND (
      a.scope = 'NATIONAL'
      OR (ctx.locality IS NOT NULL AND ctx.locality = ANY (a.localities))
    )
  ORDER BY a.priority DESC, (a.scope = 'LOCAL') DESC, a.created_at DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_active_advertisements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_advertisements(text) TO authenticated;

-- 5. Bucket de imágenes de publicidad: lectura pública, escritura solo del ADMIN general.
--    Máximo 2 MB; JPG, PNG o WebP (sin GIF animados).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ads', 'ads', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ads_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "ads_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "ads_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "ads_admin_delete" ON storage.objects;

CREATE POLICY "ads_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ads');
CREATE POLICY "ads_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ads' AND public.is_admin());
CREATE POLICY "ads_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'ads' AND public.is_admin());
CREATE POLICY "ads_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'ads' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
