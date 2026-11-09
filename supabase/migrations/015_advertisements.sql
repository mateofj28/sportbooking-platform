-- SportBooking — Publicidad segmentada por provincia
-- Migración: 015_advertisements.sql
--
-- Regla de negocio:
--   La publicidad que ve un cliente depende de DÓNDE está. Cada anuncio es
--   NACIONAL (lo ven todos) o REGIONAL (solo clientes de las provincias
--   elegidas). La ubicación del cliente es su provincia (profiles.province).
--
-- Diseño:
--   * Provincias = códigos ISO 3166-2:AR ('AR-B', 'AR-X', ...). Estables,
--     independientes de la ortografía y de APIs externas.
--   * Todas las invariantes viven en la base (CHECK + trigger), así ningún
--     cliente (ni un bug del frontend) puede guardar datos inconsistentes.
--   * El cliente NO lee la tabla: consume get_active_advertisements(), que
--     decide en el servidor qué le corresponde y expone solo columnas públicas.
--   * Solo el ADMIN general gestiona anuncios (RLS).
-- ============================================================


-- ============================================================
-- 1. Catálogo de provincias (ISO 3166-2:AR) — fuente única de verdad
-- ============================================================
CREATE OR REPLACE FUNCTION public.ar_province_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT ARRAY[
    'AR-A', 'AR-B', 'AR-C', 'AR-D', 'AR-E', 'AR-F', 'AR-G', 'AR-H',
    'AR-J', 'AR-K', 'AR-L', 'AR-M', 'AR-N', 'AR-P', 'AR-Q', 'AR-R',
    'AR-S', 'AR-T', 'AR-U', 'AR-V', 'AR-W', 'AR-X', 'AR-Y', 'AR-Z'
  ]::text[];
$$;


-- ============================================================
-- 2. Ubicación del cliente: profiles.province
--    NULL = todavía no la eligió (solo verá publicidad nacional).
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS province text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_province_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_province_valid
  CHECK (province IS NULL OR province = ANY (public.ar_province_codes()));

-- handle_new_user: copiar la provincia elegida en el registro (si es válida)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    dni,
    province,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'dni', '')), ''),
    -- Solo si es un código válido; cualquier otro valor se descarta (NULL)
    CASE
      WHEN (NEW.raw_user_meta_data ->> 'province') = ANY (public.ar_province_codes())
        THEN NEW.raw_user_meta_data ->> 'province'
      ELSE NULL
    END,
    'CLIENT',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 3. Tabla advertisements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.advertisements (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contenido
  title        text        NOT NULL,
  subtitle     text,                      -- línea superior (ej. "Temporada 2026")
  description  text,
  theme        text        NOT NULL DEFAULT 'blue',   -- paleta predefinida (no CSS libre)
  link_url     text,                      -- https://... o ruta interna (/facilities)
  cta_label    text,                      -- texto del botón (opcional)

  -- Segmentación
  scope        text        NOT NULL DEFAULT 'NATIONAL',
  provinces    text[]      NOT NULL DEFAULT '{}',

  -- Programación y orden
  priority     integer     NOT NULL DEFAULT 0,        -- mayor = aparece primero
  starts_at    timestamptz,               -- NULL = desde ya
  ends_at      timestamptz,               -- NULL = sin vencimiento
  is_active    boolean     NOT NULL DEFAULT true,     -- pausa manual

  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ads_title_len       CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT ads_subtitle_len    CHECK (subtitle    IS NULL OR char_length(subtitle)    BETWEEN 1 AND 60),
  CONSTRAINT ads_description_len CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200),
  CONSTRAINT ads_cta_len         CHECK (cta_label   IS NULL OR char_length(cta_label)   BETWEEN 1 AND 24),
  CONSTRAINT ads_theme_valid     CHECK (theme IN ('blue', 'emerald', 'violet', 'orange', 'rose', 'slate')),
  -- Solo https:// o rutas internas (/algo). Bloquea javascript:, data:, http:// y //host.
  CONSTRAINT ads_link_valid      CHECK (link_url IS NULL OR link_url ~ '^(https://[^[:space:]]+|/[^/[:space:]][^[:space:]]*|/)$'),
  CONSTRAINT ads_link_len        CHECK (link_url IS NULL OR char_length(link_url) <= 500),
  CONSTRAINT ads_scope_valid     CHECK (scope IN ('NATIONAL', 'REGIONAL')),
  CONSTRAINT ads_provinces_valid CHECK (provinces <@ public.ar_province_codes()),
  -- NACIONAL => sin provincias. REGIONAL => al menos una.
  CONSTRAINT ads_scope_provinces CHECK (
    (scope = 'NATIONAL' AND cardinality(provinces) = 0)
    OR
    (scope = 'REGIONAL' AND cardinality(provinces) >= 1)
  ),
  CONSTRAINT ads_priority_range  CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT ads_dates_order     CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE  public.advertisements IS 'Publicidad del home del cliente, segmentada por provincia.';
COMMENT ON COLUMN public.advertisements.provinces IS 'Códigos ISO 3166-2:AR. Vacío si scope = NATIONAL.';
COMMENT ON COLUMN public.advertisements.priority  IS '0-100. Mayor = aparece primero. Desempate: regional antes que nacional, luego más reciente.';

-- Normalización: recorta textos, convierte "" en NULL, ordena y deduplica provincias
CREATE OR REPLACE FUNCTION public.normalize_advertisement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title       := btrim(NEW.title);
  NEW.subtitle    := NULLIF(btrim(NEW.subtitle), '');
  NEW.description := NULLIF(btrim(NEW.description), '');
  NEW.cta_label   := NULLIF(btrim(NEW.cta_label), '');
  NEW.link_url    := NULLIF(btrim(NEW.link_url), '');
  NEW.provinces   := COALESCE(
    ARRAY(SELECT DISTINCT p FROM unnest(NEW.provinces) AS p ORDER BY p),
    '{}'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_advertisement ON public.advertisements;
CREATE TRIGGER normalize_advertisement
  BEFORE INSERT OR UPDATE ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.normalize_advertisement();

DROP TRIGGER IF EXISTS set_updated_at ON public.advertisements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índices: el listado del cliente filtra por activo + ventana + provincia
CREATE INDEX IF NOT EXISTS idx_ads_active
  ON public.advertisements (priority DESC, created_at DESC)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_ads_provinces
  ON public.advertisements USING gin (provinces);


-- ============================================================
-- 4. RLS: solo el ADMIN general gestiona anuncios.
--    Los clientes no leen la tabla; usan get_active_advertisements().
-- ============================================================
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_admin_all" ON public.advertisements;
CREATE POLICY "ads_admin_all" ON public.advertisements
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- 5. RPC: get_active_advertisements
--    Devuelve lo que le corresponde ver a un cliente:
--      - activo, dentro de su ventana de vigencia
--      - nacional, o regional que incluya SU provincia
--    Provincia = p_province si se envía (simulación del panel admin);
--    si no, la del perfil del usuario autenticado; si no tiene, solo
--    se muestran los nacionales.
--    Orden: prioridad, regional antes que nacional, más reciente.
--    Máximo 10 (el carrusel no es un catálogo).
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
    SELECT COALESCE(
      NULLIF(btrim(p_province), ''),
      (SELECT pr.province FROM public.profiles pr WHERE pr.id = auth.uid())
    ) AS province
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

REVOKE ALL ON FUNCTION public.get_active_advertisements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_advertisements(text) TO anon, authenticated;


-- ============================================================
-- 6. Datos iniciales: las 4 promociones que hoy estaban fijas en el código
--    (nacionales, para no cambiar lo que ven los clientes). El admin las
--    puede editar, segmentar o borrar desde el panel.
-- ============================================================
INSERT INTO public.advertisements (title, subtitle, description, theme, scope, priority)
VALUES
  ('🏆 Torneo de Fútbol 5', 'Inscripciones abiertas', 'Organiza tu equipo y participa en el torneo de verano.',          'blue',    'NATIONAL', 40),
  ('🎾 Clases de Tenis',    'Nuevos horarios',        'Aprende con profesores certificados. Todos los niveles.',          'emerald', 'NATIONAL', 30),
  ('🏸 30% OFF Pádel',      'Horarios matutinos',     'Reserva antes de las 12pm y obtén descuento automático.',          'violet',  'NATIONAL', 20),
  ('🏀 Liga de Básquet',    'Temporada 2026',         'Forma tu equipo de 5 y compite cada sábado.',                      'orange',  'NATIONAL', 10);
