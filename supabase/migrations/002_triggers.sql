-- ============================================================
-- SportBooking — Triggers y funciones de base de datos
-- Migración: 002_triggers.sql
-- Idempotente: usa CREATE OR REPLACE para todas las funciones
-- ============================================================

-- ============================================================
-- 1. TRIGGER: handle_new_user
--    Crea automáticamente una fila en public.profiles cada vez
--    que se registra un usuario en auth.users.
--    Edge case: si first_name/last_name vienen en raw_user_meta_data
--    los usa; si no, deja cadena vacía (no falla).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    'CLIENT',   -- todos los usuarios nuevos arrancan como CLIENT
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotente: si ya existe el perfil, no falla

  RETURN NEW;
END;
$$;

-- Eliminar el trigger si existe para recrearlo limpio
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. TRIGGER: set_updated_at
--    Actualiza el campo updated_at a now() en cada UPDATE.
--    Se aplica a todas las tablas que tienen ese campo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicar en cada tabla con updated_at
-- (DROP IF EXISTS + CREATE para idempotencia)

DROP TRIGGER IF EXISTS set_updated_at ON public.venues;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.sports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.sports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.facilities;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.schedules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.pricing;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.blocked_slots;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.blocked_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.recurring_bookings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.recurring_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.bookings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. FUNCIÓN: set_user_role
--    Asigna (o cambia) el rol y venue_id de un usuario.
--    Actualiza:
--      a) public.profiles  (para queries directas)
--      b) auth.users.app_metadata  (para que el JWT lo lleve)
--    Solo ejecutable con service_role (SECURITY DEFINER).
--    Edge cases:
--      - p_role inválido → error descriptivo
--      - p_venue_id requerido para VENUE_ADMIN → error si es NULL
--      - usuario no existe → error descriptivo
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id  uuid,
  p_role     text,
  p_venue_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_roles text[] := ARRAY['CLIENT', 'ADMIN', 'VENUE_ADMIN'];
BEGIN
  -- Validar que el rol sea válido
  IF NOT (p_role = ANY(v_valid_roles)) THEN
    RAISE EXCEPTION 'Rol inválido: %. Debe ser uno de: %', p_role, array_to_string(v_valid_roles, ', ');
  END IF;

  -- VENUE_ADMIN requiere venue_id
  IF p_role = 'VENUE_ADMIN' AND p_venue_id IS NULL THEN
    RAISE EXCEPTION 'venue_id es requerido para el rol VENUE_ADMIN';
  END IF;

  -- CLIENT y ADMIN no deben tener venue_id
  IF p_role IN ('CLIENT', 'ADMIN') THEN
    p_venue_id := NULL;
  END IF;

  -- Verificar que el usuario existe en profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado en profiles: %', p_user_id;
  END IF;

  -- Actualizar profiles
  UPDATE public.profiles
  SET
    role     = p_role::public.role,
    venue_id = p_venue_id,
    updated_at = now()
  WHERE id = p_user_id;

  -- Actualizar app_metadata en auth.users para que el JWT lo refleje
  -- Se hace con raw_app_meta_data que es el campo correcto en Supabase
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data ||
    jsonb_build_object(
      'role',     p_role,
      'venue_id', p_venue_id::text
    )
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success',   true,
    'user_id',   p_user_id,
    'role',      p_role,
    'venue_id',  p_venue_id
  );
END;
$$;


-- ============================================================
-- 4. FUNCIONES HELPER para Row Level Security (RLS)
--    Leen desde public.profiles (no parsean el JWT directamente).
--    Esto es más robusto: si Supabase cambia el formato del JWT,
--    las políticas siguen funcionando.
--    STABLE + SECURITY DEFINER: se ejecutan como el dueño de la
--    función, no como el usuario llamante, para evitar recursión
--    infinita con las políticas de RLS en profiles.
--    Edge case: si el perfil no existe aún (e.g., trigger tardío),
--    devuelven valores seguros por defecto en vez de error.
-- ============================================================

-- Devuelve el rol del usuario autenticado actual
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()),
    'CLIENT'  -- default seguro si el perfil no existe aún
  );
$$;

-- Devuelve el venue_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION public.get_my_venue_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT venue_id
  FROM public.profiles
  WHERE id = auth.uid();
  -- Devuelve NULL si no existe el perfil o si no tiene venue_id asignado
$$;

-- Verifica si el usuario autenticado es ADMIN general
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'ADMIN' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Verifica si el usuario autenticado es VENUE_ADMIN
CREATE OR REPLACE FUNCTION public.is_venue_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'VENUE_ADMIN' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Verifica si el usuario autenticado es ADMIN o VENUE_ADMIN
CREATE OR REPLACE FUNCTION public.is_admin_or_venue_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('ADMIN', 'VENUE_ADMIN') FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Verifica si una venue_id dada pertenece al usuario actual (VENUE_ADMIN scope check)
CREATE OR REPLACE FUNCTION public.owns_venue(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT venue_id = p_venue_id
     FROM public.profiles
     WHERE id = auth.uid() AND role = 'VENUE_ADMIN'),
    false
  );
$$;
