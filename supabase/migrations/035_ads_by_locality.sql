-- SportBooking — Publicidad segmentada por MUNICIPIO (no por provincia)
-- Migración: 035_ads_by_locality.sql
--
-- Regla (acordada): la publicidad es "Todo el país" o "Municipios específicos". La
-- provincia deja de usarse para segmentar. Se muestra según la localidad en la que
-- está el usuario AHORA (GPS del navegador -> lib/geo/locality-locator.ts).
-- Sin ubicación precisa (sin permiso de GPS, o en zona rural fuera de todo municipio)
-- el usuario ve solo las nacionales.
--
-- Localidad = municipio de Georef (incluye partidos de Buenos Aires y comunas de CABA);
-- en Santiago del Estero y Santa Cruz, departamento. Catálogo: public.ar_localities (034).
--
-- Cambios:
--   * scope: 'NATIONAL' | 'LOCAL' (antes 'REGIONAL' por provincia).
--   * localities text[]: códigos de ar_localities (validados por trigger).
--   * Se quita provinces (al aplicar, ninguna publicidad lo usaba: las 4 eran nacionales).
--   * get_active_advertisements(p_locality).
-- ============================================================

-- Seguridad: no seguir si alguna publicidad usa provincias (no se pierde segmentación en silencio)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.advertisements WHERE scope <> 'NATIONAL' OR cardinality(provinces) > 0) THEN
    RAISE EXCEPTION 'Hay publicidades segmentadas por provincia: migrarlas a localidades antes de aplicar 035';
  END IF;
END $$;

-- 1. Columnas y restricciones
ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS ads_scope_provinces;
ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS ads_provinces_valid;
ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS ads_scope_valid;
DROP INDEX IF EXISTS public.idx_ads_provinces;
ALTER TABLE public.advertisements DROP COLUMN IF EXISTS provinces;

ALTER TABLE public.advertisements ADD COLUMN IF NOT EXISTS localities text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.advertisements
  ADD CONSTRAINT ads_scope_valid CHECK (scope IN ('NATIONAL', 'LOCAL')),
  -- NACIONAL => sin localidades. LOCAL => entre 1 y 500 localidades
  -- (alcanza para todos los municipios de la provincia más grande: Córdoba, 427).
  ADD CONSTRAINT ads_scope_localities CHECK (
    (scope = 'NATIONAL' AND cardinality(localities) = 0)
    OR (scope = 'LOCAL' AND cardinality(localities) BETWEEN 1 AND 500)
  );

COMMENT ON TABLE  public.advertisements IS 'Publicidad del home del cliente: nacional o por municipio (localidad actual del usuario).';
COMMENT ON COLUMN public.advertisements.localities IS 'Códigos de public.ar_localities ("mun-<id>" / "dep-<id>"). Vacío si scope = NATIONAL.';

CREATE INDEX IF NOT EXISTS idx_ads_localities ON public.advertisements USING gin (localities);

-- 2. Normalización: textos + localidades ordenadas, sin repetidos y existentes
CREATE OR REPLACE FUNCTION public.normalize_advertisement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unknown text;
BEGIN
  NEW.title       := btrim(NEW.title);
  NEW.subtitle    := NULLIF(btrim(NEW.subtitle), '');
  NEW.description := NULLIF(btrim(NEW.description), '');
  NEW.cta_label   := NULLIF(btrim(NEW.cta_label), '');
  NEW.link_url    := NULLIF(btrim(NEW.link_url), '');
  NEW.localities  := COALESCE(
    ARRAY(SELECT DISTINCT btrim(l) FROM unnest(NEW.localities) AS l WHERE btrim(l) <> '' ORDER BY 1),
    '{}'
  );

  SELECT l INTO v_unknown
  FROM unnest(NEW.localities) AS l
  WHERE NOT EXISTS (SELECT 1 FROM public.ar_localities a WHERE a.code = l)
  LIMIT 1;
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Localidad desconocida: %', v_unknown USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Lo que le corresponde ver a un cliente según su localidad actual
DROP FUNCTION IF EXISTS public.get_active_advertisements(text);
CREATE FUNCTION public.get_active_advertisements(p_locality text DEFAULT NULL)
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
    -- Solo códigos reales del catálogo; cualquier otro valor = "sin localidad" (solo nacionales)
    SELECT (SELECT a.code FROM public.ar_localities a WHERE a.code = btrim(p_locality)) AS locality
  )
  SELECT a.id, a.title, a.subtitle, a.description, a.theme, a.link_url, a.cta_label, a.scope
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

NOTIFY pgrst, 'reload schema';
