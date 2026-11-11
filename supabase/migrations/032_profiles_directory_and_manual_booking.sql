-- SportBooking — Directorio de clientes para el admin de sede + búsqueda para la reserva manual
-- Migración: 032_profiles_directory_and_manual_booking.sql
--
-- Regla (acordada): el admin de sede ve del cliente NOMBRE y EMAIL. DNI y teléfono
-- solo el admin general. El email le sirve para encontrar al cliente en "Reserva Manual".
--
-- Problema: la política profiles_select_venue_admin (014) le daba al admin de sede la
-- fila COMPLETA del perfil (DNI, teléfono…) de sus clientes, legible por la API aunque
-- la pantalla no lo mostrara. RLS filtra filas, no columnas, así que no alcanza con
-- ajustarla.
--
-- Solución:
--   1. Vista profile_directory (id, nombre, apellido, email) con el mismo alcance que
--      antes: lo propio, el ADMIN general, y el admin de sede para clientes con reservas
--      o turnos fijos en su sede. Las consultas embebidas del frontend la usan en lugar
--      de profiles para leer datos de OTRAS personas.
--   2. Se quita la política 014 (migración 033, después de publicar el frontend).
--   3. admin_list_bookings pasa a SECURITY DEFINER (aplica su propio alcance) y devuelve
--      el email también al admin de sede; DNI/teléfono siguen siendo solo del general.
--   4. admin_lookup_client: búsqueda EXACTA de un cliente para la reserva manual.
--      Por email: ambos admins. Por DNI: solo el general. Devuelve id, nombre y email
--      (y DNI solo al general). Sin búsquedas parciales: no sirve para listar a nadie.
-- ============================================================

-- ------------------------------------------------------------
-- 3. admin_list_bookings (cambios respecto de 031: DEFINER, email para ambos admins)
-- ------------------------------------------------------------
-- (Descripción original de 031)
-- Regla: el admin de sede (VENUE_ADMIN) solo ve el NOMBRE del cliente. DNI, teléfono
-- y email quedan para el admin general. No basta con ocultarlo en la pantalla: la RPC
-- deja de devolver esos datos al admin de sede, y la búsqueda por email/DNI/teléfono
-- solo funciona para el admin general (si no, el admin de sede podría confirmar un DNI
-- buscándolo aunque no lo vea).
-- El resto de la función es idéntico a 023.
-- ============================================================
--
-- (Descripción original de 023)
-- Problema: la RPC aceptaba cualquier fecha (año 1111, 0001) y rangos invertidos.
-- En el panel, un año escrito a mano devolvía "0 reservas" sin explicar por qué.
--
-- Regla (igual que el selector y Zod, ver bookingRangeSchema en el frontend):
--   * Cada día debe ser una fecha real ('2026-13-99' se rechaza).
--   * Entre HOY - 2 años y HOY + 2 años (día calendario en hora de Argentina).
--     Como p_to es EXCLUSIVO, se admite hasta HOY + 2 años + 1 día.
--   * p_from < p_to.
-- El resto de la función es idéntico a 021.
-- ============================================================
--
-- (Descripción original de 021)
-- Solución: una RPC que resuelve TODO en la base y devuelve solo una página:
--   * Rango de fechas por día de INICIO del turno, cortado a medianoche AR.
--   * Estado de NEGOCIO (Realizada / Pendiente de pago / Completada / Cancelada),
--     calculado contra now() — misma regla que getAdminBookingState() del frontend.
--   * Búsqueda por cliente (nombre, email, DNI, teléfono), cancha o complejo.
--   * Contadores por estado (con fecha + búsqueda, sin el filtro de estado).
--   * Orden: próximas primero (la más cercana arriba), después las pasadas
--     (de la más reciente a la más vieja).
--
-- Seguridad (defensa en profundidad):
--   * SECURITY INVOKER: el RLS de bookings/profiles sigue aplicando tal cual.
--   * Solo ADMIN, o VENUE_ADMIN con sede asignada. Otro rol -> error.
--   * VENUE_ADMIN: solo reservas de SU complejo (sus reservas como cliente en
--     otros complejos no son del panel).
--   * La comisión solo viaja para el ADMIN general.
--   * EXECUTE solo para authenticated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_bookings(
  p_from     text    DEFAULT NULL,   -- 'YYYY-MM-DD' (día AR, inclusive)
  p_to       text    DEFAULT NULL,   -- 'YYYY-MM-DD' (día AR, EXCLUSIVO)
  p_state    text    DEFAULT 'ALL',  -- ALL | REALIZADA | PENDIENTE_PAGO | COMPLETADA | CANCELADA
  p_search   text    DEFAULT NULL,
  p_page     int     DEFAULT 1,
  p_per_page int     DEFAULT 12
)
RETURNS json
LANGUAGE plpgsql
STABLE
-- DEFINER desde 032: el admin de sede ya no lee profiles directo (se quitó la política
-- 014). El alcance lo aplica la propia función: control de rol al inicio y
-- "v_role = 'ADMIN' OR f.venue_id = v_venue_id" en el WHERE.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now       timestamptz := now();
  v_role      text        := public.get_my_role();
  v_venue_id  uuid        := public.get_my_venue_id();
  v_from      timestamptz;
  v_to        timestamptz;
  v_state     text        := upper(coalesce(nullif(trim(p_state), ''), 'ALL'));
  v_q         text;
  v_pattern   text;
  v_digits    text;
  v_per_page  int         := least(greatest(coalesce(p_per_page, 12), 1), 100);
  v_page      int         := greatest(coalesce(p_page, 1), 1);
  v_offset    int;
  v_result    json;
  v_today_ar  date        := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_min_day   date;
  v_max_to    date;
  v_from_day  date;
  v_to_day    date;
BEGIN
  -- 1. Autorización
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'VENUE_ADMIN') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'VENUE_ADMIN' AND v_venue_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: el administrador de sede no tiene sede asignada' USING ERRCODE = '42501';
  END IF;

  -- 2. Validación de parámetros
  IF v_state NOT IN ('ALL', 'REALIZADA', 'PENDIENTE_PAGO', 'COMPLETADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_state USING ERRCODE = '22023';
  END IF;
  v_min_day := (v_today_ar - interval '2 years')::date;
  v_max_to  := (v_today_ar + interval '2 years')::date + 1;  -- p_to es exclusivo

  IF p_from IS NOT NULL THEN
    IF p_from !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Fecha desde inválida' USING ERRCODE = '22023'; END IF;
    BEGIN
      v_from_day := p_from::date;   -- rechaza fechas inexistentes (2026-13-99, 2026-02-30)
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Fecha desde inválida' USING ERRCODE = '22023';
    END;
    IF v_from_day < v_min_day OR v_from_day >= v_max_to THEN
      RAISE EXCEPTION 'Fecha desde fuera de rango (% a %)', v_min_day, v_max_to - 1 USING ERRCODE = '22023';
    END IF;
    v_from := public.ar_midnight_utc(p_from);
  END IF;
  IF p_to IS NOT NULL THEN
    IF p_to !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Fecha hasta inválida' USING ERRCODE = '22023'; END IF;
    BEGIN
      v_to_day := p_to::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Fecha hasta inválida' USING ERRCODE = '22023';
    END;
    IF v_to_day <= v_min_day OR v_to_day > v_max_to THEN
      RAISE EXCEPTION 'Fecha hasta fuera de rango (% a %)', v_min_day, v_max_to - 1 USING ERRCODE = '22023';
    END IF;
    v_to := public.ar_midnight_utc(p_to);
  END IF;
  IF v_from_day IS NOT NULL AND v_to_day IS NOT NULL AND v_from_day >= v_to_day THEN
    RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la de inicio' USING ERRCODE = '22023';
  END IF;

  -- 3. Búsqueda: escapar comodines de LIKE y limitar el largo
  v_q := nullif(left(trim(coalesce(p_search, '')), 100), '');
  IF v_q IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits  := regexp_replace(v_q, '\D', '', 'g');
    IF length(v_digits) < 3 THEN v_digits := NULL; END IF;
  END IF;

  v_offset := (v_page - 1) * v_per_page;

  WITH base AS (
    SELECT
      b.*,
      f.name       AS f_name,
      f.image_url  AS f_image_url,
      v.id         AS v_id,
      v.name       AS v_name,
      v.city       AS v_city,
      s.id         AS s_id,
      s.name       AS s_name,
      pr.id        AS u_id,
      pr.first_name, pr.last_name, pr.dni, pr.phone, pr.email,
      -- Estado de negocio (mismo orden de reglas que getAdminBookingState)
      CASE
        WHEN b.status = 'CANCELLED'        THEN 'CANCELADA'
        WHEN b.status = 'COMPLETED'        THEN 'COMPLETADA'
        WHEN b.payment_status <> 'PAID'    THEN 'PENDIENTE_PAGO'
        WHEN b.end_datetime <= v_now       THEN 'COMPLETADA'
        ELSE 'REALIZADA'
      END AS biz_state
    FROM public.bookings b
    JOIN public.facilities f     ON f.id = b.facility_id
    LEFT JOIN public.venues v    ON v.id = f.venue_id
    LEFT JOIN public.sports s    ON s.id = f.sport_id
    LEFT JOIN public.profiles pr ON pr.id = b.user_id
    WHERE (v_from IS NULL OR b.start_datetime >= v_from)
      AND (v_to   IS NULL OR b.start_datetime <  v_to)
      AND (v_role = 'ADMIN' OR f.venue_id = v_venue_id)
      AND (
        v_q IS NULL
        OR (coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')) ILIKE v_pattern
        OR f.name   ILIKE v_pattern
        OR v.name   ILIKE v_pattern
        -- Buscar por DNI o teléfono solo el ADMIN general: si el admin de sede pudiera
        -- buscar por esos datos, podría confirmarlos aunque no los vea (031).
        OR pr.email ILIKE v_pattern   -- el email lo ven ambos admins (032)
        OR (v_role = 'ADMIN' AND v_digits IS NOT NULL AND (
              regexp_replace(coalesce(pr.dni,   ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
           OR regexp_replace(coalesce(pr.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'))
      )
  ),
  counts AS (
    SELECT
      count(*)                                            AS all_count,
      count(*) FILTER (WHERE biz_state = 'REALIZADA')      AS realizada,
      count(*) FILTER (WHERE biz_state = 'PENDIENTE_PAGO') AS pendiente_pago,
      count(*) FILTER (WHERE biz_state = 'COMPLETADA')     AS completada,
      count(*) FILTER (WHERE biz_state = 'CANCELADA')      AS cancelada
    FROM base
  ),
  filtered AS (
    SELECT base.*,
      row_number() OVER (
        ORDER BY
          (start_datetime < v_now),                                    -- próximas primero
          CASE WHEN start_datetime >= v_now THEN start_datetime END ASC, -- la más cercana arriba
          start_datetime DESC,                                         -- pasadas: más reciente arriba
          id
      ) AS rn
    FROM base
    WHERE v_state = 'ALL' OR biz_state = v_state
  ),
  page AS (
    SELECT * FROM filtered
    WHERE rn > v_offset AND rn <= v_offset + v_per_page
  )
  SELECT json_build_object(
    'items', coalesce((
      SELECT json_agg(json_build_object(
        'id',                   p.id,
        'facility_id',          p.facility_id,
        'user_id',              p.user_id,
        'start_datetime',       p.start_datetime,
        'end_datetime',         p.end_datetime,
        'status',               p.status,
        'payment_status',       p.payment_status,
        'recurring_booking_id', p.recurring_booking_id,
        'base_price',           p.base_price,
        'total_price',          CASE WHEN v_role = 'ADMIN' THEN p.total_price END,
        'commission_amount',    CASE WHEN v_role = 'ADMIN' THEN p.commission_amount END,
        'currency',             p.currency,
        'cancellation_reason',  p.cancellation_reason,
        'biz_state',            p.biz_state,
        'facility', json_build_object(
          'id', p.facility_id, 'name', p.f_name, 'image_url', p.f_image_url,
          'venue', CASE WHEN p.v_id IS NULL THEN NULL
                        ELSE json_build_object('id', p.v_id, 'name', p.v_name, 'city', p.v_city) END,
          'sport', CASE WHEN p.s_id IS NULL THEN NULL
                        ELSE json_build_object('id', p.s_id, 'name', p.s_name) END
        ),
        -- Datos de contacto del cliente: solo para el ADMIN general (031).
        -- El admin de sede recibe únicamente el nombre.
        'user', CASE WHEN p.u_id IS NULL THEN NULL
                     ELSE json_build_object(
                       'id', p.u_id, 'first_name', p.first_name, 'last_name', p.last_name,
                       'dni',   CASE WHEN v_role = 'ADMIN' THEN p.dni   END,
                       'phone', CASE WHEN v_role = 'ADMIN' THEN p.phone END,
                       'email', p.email) END   -- email: ambos admins (032)
      ) ORDER BY p.rn)
      FROM page p
    ), '[]'::json),
    'total',    (SELECT count(*) FROM filtered),
    'page',     v_page,
    'per_page', v_per_page,
    'counts',   (SELECT json_build_object(
                   'ALL', all_count, 'REALIZADA', realizada, 'PENDIENTE_PAGO', pendiente_pago,
                   'COMPLETADA', completada, 'CANCELADA', cancelada) FROM counts)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_bookings(text, text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_bookings(text, text, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_bookings(text, text, text, text, int, int) TO authenticated;

-- ------------------------------------------------------------
-- 1. Directorio: nombre y email de las personas que cada usuario puede ver
-- ------------------------------------------------------------
-- Vista con los permisos de su dueño (no security_invoker): lee profiles completo y
-- filtra acá. Solo expone id, nombre, apellido y email; nunca DNI ni teléfono.
CREATE OR REPLACE VIEW public.profile_directory
WITH (security_invoker = false) AS
  SELECT p.id, p.first_name, p.last_name, p.email
  FROM public.profiles p
  WHERE p.id = auth.uid()
     OR public.is_admin()
     OR public.venue_admin_can_see_profile(p.id);

COMMENT ON VIEW public.profile_directory IS
  'Nombre y email de las personas visibles para quien consulta (propio, admin general, admin de sede para sus clientes). Sin DNI ni teléfono. Migración 032.';

REVOKE ALL ON public.profile_directory FROM PUBLIC, anon;
GRANT SELECT ON public.profile_directory TO authenticated;

-- ------------------------------------------------------------
-- 2. Quitar la política 014: va en la migración 033, que se aplica DESPUÉS de publicar el
--    frontend que usa profile_directory (si no, el admin de sede pierde los nombres en
--    las pantallas viejas mientras tanto).
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 4. Búsqueda exacta de un cliente para la reserva manual
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_lookup_client(p_email text DEFAULT NULL, p_dni text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := public.get_my_role();
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_dni   text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_found record;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'VENUE_ADMIN') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'VENUE_ADMIN' AND public.get_my_venue_id() IS NULL THEN
    RAISE EXCEPTION 'No autorizado: el administrador de sede no tiene sede asignada' USING ERRCODE = '42501';
  END IF;
  IF (v_email IS NULL) = (v_dni IS NULL) THEN
    RAISE EXCEPTION 'Indicá el email o el DNI del cliente' USING ERRCODE = '22023';
  END IF;
  IF v_dni IS NOT NULL AND v_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'La búsqueda por DNI es solo para el administrador general' USING ERRCODE = '42501';
  END IF;
  IF v_email IS NOT NULL AND length(v_email) > 254 THEN
    RAISE EXCEPTION 'Email inválido' USING ERRCODE = '22023';
  END IF;

  SELECT id, first_name, last_name, email, dni INTO v_found
  FROM public.profiles
  WHERE is_active
    AND (
      (v_email IS NOT NULL AND lower(email) = v_email)
      OR (v_dni IS NOT NULL AND regexp_replace(coalesce(dni, ''), '\D', '', 'g') = v_dni)
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id',         v_found.id,
    'first_name', v_found.first_name,
    'last_name',  v_found.last_name,
    'email',      v_found.email,
    'dni',        CASE WHEN v_role = 'ADMIN' THEN v_found.dni END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lookup_client(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lookup_client(text, text) TO authenticated;

-- PostgREST: refrescar el esquema para que vea la vista y sus relaciones
NOTIFY pgrst, 'reload schema';
