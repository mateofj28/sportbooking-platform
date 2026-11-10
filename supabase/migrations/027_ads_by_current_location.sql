-- SportBooking — Publicidad según la ubicación ACTUAL (no la del perfil)
-- Migración: 027_ads_by_current_location.sql
--
-- Antes: get_active_advertisements usaba p_province si venía (simulación del
-- panel) y, si no, profiles.province. La provincia del perfil es fija: alguien de
-- Buenos Aires que hoy está en Córdoba seguía viendo la publicidad de Buenos Aires.
--
-- Ahora la provincia la determina el navegador en cada visita
-- (hooks/use-current-province.ts: GPS, o IP como respaldo) y se pasa en p_province.
--   * Se deja de leer profiles.province.
--   * p_province se valida contra el catálogo: un valor desconocido se trata como
--     "sin provincia" (solo nacionales), igual que NULL.
--
-- La columna profiles.province NO se borra en esta migración (no se eliminan
-- datos); simplemente deja de usarse. El registro ya no la pide.
-- Firma, permisos (solo authenticated, 016) y orden: sin cambios.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_advertisements(p_province text DEFAULT NULL)
RETURNS TABLE (
  id          uuid,
  title       text,
  subtitle    text,
  description text,
  theme       text,
  link_url    text,
  cta_label   text,
  scope       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT CASE
             WHEN upper(btrim(p_province)) = ANY (public.ar_province_codes())
             THEN upper(btrim(p_province))
           END AS province
  )
  SELECT a.id, a.title, a.subtitle, a.description, a.theme, a.link_url, a.cta_label, a.scope
  FROM public.advertisements a
  CROSS JOIN ctx
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at   IS NULL OR a.ends_at   >  now())
    AND (
      a.scope = 'NATIONAL'
      OR (ctx.province IS NOT NULL AND ctx.province = ANY (a.provinces))
    )
  ORDER BY a.priority DESC, (a.scope = 'REGIONAL') DESC, a.created_at DESC
  LIMIT 10;
$$;

COMMENT ON COLUMN public.profiles.province IS
  'En desuso desde 027: la publicidad usa la ubicación actual del navegador, no el perfil.';
