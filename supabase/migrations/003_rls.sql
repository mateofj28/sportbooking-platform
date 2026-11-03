-- ============================================================
-- SportBooking — Row Level Security (RLS)
-- Migración: 003_rls.sql
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE
-- ============================================================
-- Principio: sin políticas = acceso denegado por defecto.
-- Las Edge Functions usan service_role (bypass de RLS).
-- Las funciones helper (is_admin, owns_venue, etc.) leen
-- desde public.profiles para evitar depender del JWT.
-- ============================================================

-- ============================================================
-- HABILITAR RLS EN LAS 12 TABLAS
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_sports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- SELECT: cada usuario solo ve su propio perfil.
--         ADMIN ve todos los perfiles.
-- UPDATE: cada usuario solo actualiza su propio perfil.
-- INSERT: bloqueado aquí (lo hace el trigger handle_new_user).
-- DELETE: bloqueado (nunca se borran perfiles, se desactivan).
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- VENUES
-- SELECT: público (usuarios anónimos y autenticados pueden ver sedes activas).
-- INSERT: solo ADMIN.
-- UPDATE: ADMIN puede todo; VENUE_ADMIN solo su propia sede.
-- DELETE: solo ADMIN.
-- ============================================================

DROP POLICY IF EXISTS "venues_select_public"       ON public.venues;
DROP POLICY IF EXISTS "venues_insert_admin"        ON public.venues;
DROP POLICY IF EXISTS "venues_update_admin"        ON public.venues;
DROP POLICY IF EXISTS "venues_update_venue_admin"  ON public.venues;
DROP POLICY IF EXISTS "venues_delete_admin"        ON public.venues;

CREATE POLICY "venues_select_public" ON public.venues
  FOR SELECT USING (true);  -- público: clientes buscan sedes sin estar logueados

CREATE POLICY "venues_insert_admin" ON public.venues
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "venues_update_admin" ON public.venues
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "venues_update_venue_admin" ON public.venues
  FOR UPDATE USING (public.owns_venue(id));

CREATE POLICY "venues_delete_admin" ON public.venues
  FOR DELETE USING (public.is_admin());

-- ============================================================
-- SPORTS
-- SELECT: público.
-- INSERT/UPDATE/DELETE: solo ADMIN.
-- ============================================================

DROP POLICY IF EXISTS "sports_select_public"  ON public.sports;
DROP POLICY IF EXISTS "sports_insert_admin"   ON public.sports;
DROP POLICY IF EXISTS "sports_update_admin"   ON public.sports;
DROP POLICY IF EXISTS "sports_delete_admin"   ON public.sports;

CREATE POLICY "sports_select_public" ON public.sports
  FOR SELECT USING (true);

CREATE POLICY "sports_insert_admin" ON public.sports
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "sports_update_admin" ON public.sports
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "sports_delete_admin" ON public.sports
  FOR DELETE USING (public.is_admin());

-- ============================================================
-- VENUE_SPORTS (M:N)
-- SELECT: público.
-- INSERT/DELETE: solo ADMIN.
-- ============================================================

DROP POLICY IF EXISTS "venue_sports_select_public"  ON public.venue_sports;
DROP POLICY IF EXISTS "venue_sports_insert_admin"   ON public.venue_sports;
DROP POLICY IF EXISTS "venue_sports_delete_admin"   ON public.venue_sports;

CREATE POLICY "venue_sports_select_public" ON public.venue_sports
  FOR SELECT USING (true);

CREATE POLICY "venue_sports_insert_admin" ON public.venue_sports
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "venue_sports_delete_admin" ON public.venue_sports
  FOR DELETE USING (public.is_admin());

-- ============================================================
-- FACILITIES
-- SELECT: público (solo las activas para anónimos, todas para admins).
-- INSERT: ADMIN o VENUE_ADMIN en su sede.
-- UPDATE: ADMIN o VENUE_ADMIN en su sede.
-- DELETE: solo ADMIN.
-- ============================================================

DROP POLICY IF EXISTS "facilities_select_active"       ON public.facilities;
DROP POLICY IF EXISTS "facilities_select_admin"        ON public.facilities;
DROP POLICY IF EXISTS "facilities_insert_admin"        ON public.facilities;
DROP POLICY IF EXISTS "facilities_insert_venue_admin"  ON public.facilities;
DROP POLICY IF EXISTS "facilities_update_admin"        ON public.facilities;
DROP POLICY IF EXISTS "facilities_update_venue_admin"  ON public.facilities;
DROP POLICY IF EXISTS "facilities_delete_admin"        ON public.facilities;

CREATE POLICY "facilities_select_active" ON public.facilities
  FOR SELECT USING (is_active = true);

-- ADMIN ve todas (incluso inactivas)
CREATE POLICY "facilities_select_admin" ON public.facilities
  FOR SELECT USING (public.is_admin_or_venue_admin());

CREATE POLICY "facilities_insert_admin" ON public.facilities
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "facilities_insert_venue_admin" ON public.facilities
  FOR INSERT WITH CHECK (
    public.is_venue_admin() AND public.owns_venue(venue_id)
  );

CREATE POLICY "facilities_update_admin" ON public.facilities
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "facilities_update_venue_admin" ON public.facilities
  FOR UPDATE USING (
    public.is_venue_admin() AND public.owns_venue(venue_id)
  );

CREATE POLICY "facilities_delete_admin" ON public.facilities
  FOR DELETE USING (public.is_admin());

-- ============================================================
-- SCHEDULES
-- SELECT: público (para mostrar horarios en el frontend).
-- INSERT/UPDATE/DELETE: ADMIN o VENUE_ADMIN en su sede
--   (join a facilities para verificar venue_id).
-- ============================================================

DROP POLICY IF EXISTS "schedules_select_public"       ON public.schedules;
DROP POLICY IF EXISTS "schedules_insert_admin"        ON public.schedules;
DROP POLICY IF EXISTS "schedules_insert_venue_admin"  ON public.schedules;
DROP POLICY IF EXISTS "schedules_update_admin"        ON public.schedules;
DROP POLICY IF EXISTS "schedules_update_venue_admin"  ON public.schedules;
DROP POLICY IF EXISTS "schedules_delete_admin"        ON public.schedules;
DROP POLICY IF EXISTS "schedules_delete_venue_admin"  ON public.schedules;

CREATE POLICY "schedules_select_public" ON public.schedules
  FOR SELECT USING (true);

CREATE POLICY "schedules_insert_admin" ON public.schedules
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "schedules_insert_venue_admin" ON public.schedules
  FOR INSERT WITH CHECK (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "schedules_update_admin" ON public.schedules
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "schedules_update_venue_admin" ON public.schedules
  FOR UPDATE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "schedules_delete_admin" ON public.schedules
  FOR DELETE USING (public.is_admin());

CREATE POLICY "schedules_delete_venue_admin" ON public.schedules
  FOR DELETE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

-- ============================================================
-- PRICING
-- SELECT: público (para mostrar tarifas en el frontend).
-- INSERT/UPDATE/DELETE: ADMIN o VENUE_ADMIN en su sede.
-- ============================================================

DROP POLICY IF EXISTS "pricing_select_public"       ON public.pricing;
DROP POLICY IF EXISTS "pricing_insert_admin"        ON public.pricing;
DROP POLICY IF EXISTS "pricing_insert_venue_admin"  ON public.pricing;
DROP POLICY IF EXISTS "pricing_update_admin"        ON public.pricing;
DROP POLICY IF EXISTS "pricing_update_venue_admin"  ON public.pricing;
DROP POLICY IF EXISTS "pricing_delete_admin"        ON public.pricing;
DROP POLICY IF EXISTS "pricing_delete_venue_admin"  ON public.pricing;

CREATE POLICY "pricing_select_public" ON public.pricing
  FOR SELECT USING (true);

CREATE POLICY "pricing_insert_admin" ON public.pricing
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "pricing_insert_venue_admin" ON public.pricing
  FOR INSERT WITH CHECK (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "pricing_update_admin" ON public.pricing
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "pricing_update_venue_admin" ON public.pricing
  FOR UPDATE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "pricing_delete_admin" ON public.pricing
  FOR DELETE USING (public.is_admin());

CREATE POLICY "pricing_delete_venue_admin" ON public.pricing
  FOR DELETE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

-- ============================================================
-- BLOCKED_SLOTS
-- SELECT: ADMIN ve todos; VENUE_ADMIN solo su sede; público puede
--         ver los bloqueos para saber si un slot no está disponible.
-- INSERT: ADMIN o VENUE_ADMIN en su sede.
-- UPDATE: idem INSERT.
-- DELETE: idem INSERT.
-- ============================================================

DROP POLICY IF EXISTS "blocked_slots_select_public"       ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_insert_admin"        ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_insert_venue_admin"  ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_update_admin"        ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_update_venue_admin"  ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_delete_admin"        ON public.blocked_slots;
DROP POLICY IF EXISTS "blocked_slots_delete_venue_admin"  ON public.blocked_slots;

CREATE POLICY "blocked_slots_select_public" ON public.blocked_slots
  FOR SELECT USING (true);  -- necesario para calcular disponibilidad

CREATE POLICY "blocked_slots_insert_admin" ON public.blocked_slots
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "blocked_slots_insert_venue_admin" ON public.blocked_slots
  FOR INSERT WITH CHECK (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "blocked_slots_update_admin" ON public.blocked_slots
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "blocked_slots_update_venue_admin" ON public.blocked_slots
  FOR UPDATE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "blocked_slots_delete_admin" ON public.blocked_slots
  FOR DELETE USING (public.is_admin());

CREATE POLICY "blocked_slots_delete_venue_admin" ON public.blocked_slots
  FOR DELETE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

-- ============================================================
-- BOOKINGS
-- SELECT: CLIENT ve solo las suyas; VENUE_ADMIN su sede; ADMIN todo.
-- INSERT: CLIENT (sus propias), ADMIN, VENUE_ADMIN (su sede).
--         Las validaciones complejas van en la Edge Function.
-- UPDATE: CLIENT puede actualizar payment_status y cancelled_by
--         (vía Edge Functions mark-paid y cancel-booking).
--         ADMIN y VENUE_ADMIN tienen acceso más amplio.
-- DELETE: nunca (las reservas se cancelan, no se borran).
-- ============================================================

DROP POLICY IF EXISTS "bookings_select_own"          ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_venue_admin"  ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_admin"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_client"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_admin"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_client"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_venue_admin"  ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_admin"        ON public.bookings;

-- SELECT
CREATE POLICY "bookings_select_own" ON public.bookings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "bookings_select_venue_admin" ON public.bookings
  FOR SELECT USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "bookings_select_admin" ON public.bookings
  FOR SELECT USING (public.is_admin());

-- INSERT (las validaciones de negocio van en la Edge Function)
CREATE POLICY "bookings_insert_client" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (user_id = auth.uid() OR public.is_admin_or_venue_admin())
  );

CREATE POLICY "bookings_insert_admin" ON public.bookings
  FOR INSERT WITH CHECK (public.is_admin_or_venue_admin());

-- UPDATE: CLIENT solo las suyas; admins con scope
CREATE POLICY "bookings_update_client" ON public.bookings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "bookings_update_venue_admin" ON public.bookings
  FOR UPDATE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "bookings_update_admin" ON public.bookings
  FOR UPDATE USING (public.is_admin());

-- ============================================================
-- RECURRING_BOOKINGS
-- SELECT: CLIENT ve las suyas; VENUE_ADMIN su sede; ADMIN todo.
-- INSERT: CLIENT, ADMIN, VENUE_ADMIN (su sede).
-- UPDATE: CLIENT las suyas; admins con scope.
-- DELETE: nunca.
-- ============================================================

DROP POLICY IF EXISTS "recurring_select_own"          ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_select_venue_admin"  ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_select_admin"        ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_insert_any_auth"     ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_update_own"          ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_update_venue_admin"  ON public.recurring_bookings;
DROP POLICY IF EXISTS "recurring_update_admin"        ON public.recurring_bookings;

CREATE POLICY "recurring_select_own" ON public.recurring_bookings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "recurring_select_venue_admin" ON public.recurring_bookings
  FOR SELECT USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "recurring_select_admin" ON public.recurring_bookings
  FOR SELECT USING (public.is_admin());

CREATE POLICY "recurring_insert_any_auth" ON public.recurring_bookings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "recurring_update_own" ON public.recurring_bookings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "recurring_update_venue_admin" ON public.recurring_bookings
  FOR UPDATE USING (
    public.is_venue_admin() AND
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND public.owns_venue(f.venue_id)
    )
  );

CREATE POLICY "recurring_update_admin" ON public.recurring_bookings
  FOR UPDATE USING (public.is_admin());

-- ============================================================
-- NOTIFICATIONS
-- SELECT: VENUE_ADMIN ve las de su sede; ADMIN ve todo.
--         CLIENT no ve notificaciones de admin.
-- INSERT: bloqueado para usuarios (solo Edge Functions con service_role).
-- UPDATE/DELETE: bloqueado (las notificaciones no se modifican ni borran).
-- ============================================================

DROP POLICY IF EXISTS "notifications_select_venue_admin"  ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_admin"        ON public.notifications;

CREATE POLICY "notifications_select_venue_admin" ON public.notifications
  FOR SELECT USING (
    public.is_venue_admin() AND
    venue_id = public.get_my_venue_id() AND
    public.get_my_venue_id() IS NOT NULL  -- edge case: VENUE_ADMIN sin venue_id no ve nada
  );

CREATE POLICY "notifications_select_admin" ON public.notifications
  FOR SELECT USING (public.is_admin());

-- ============================================================
-- NOTIFICATION_READS
-- SELECT: cada usuario ve solo sus propias lecturas.
-- INSERT: cada usuario inserta solo las suyas (upsert idempotente).
-- UPDATE/DELETE: bloqueado.
-- ============================================================

DROP POLICY IF EXISTS "notif_reads_select_own"  ON public.notification_reads;
DROP POLICY IF EXISTS "notif_reads_insert_own"  ON public.notification_reads;

CREATE POLICY "notif_reads_select_own" ON public.notification_reads
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_reads_insert_own" ON public.notification_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());
