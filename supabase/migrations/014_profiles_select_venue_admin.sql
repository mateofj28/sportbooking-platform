-- SportBooking — VENUE_ADMIN puede ver los perfiles de sus clientes
-- Migración: 014_profiles_select_venue_admin.sql
--
-- Problema: las consultas de reservas embeben `user:profiles!user_id(...)`.
-- profiles solo era legible por su dueño o por el ADMIN general, así que un
-- VENUE_ADMIN recibía `user: null` en las reservas de otros clientes y el
-- dashboard se caía (Cannot read properties of null (reading 'firstName')).
--
-- Solución: el VENUE_ADMIN puede leer el perfil de los usuarios que tienen
-- al menos una reserva o turno fijo en una cancha de SU sede.
-- Se usa una función SECURITY DEFINER para evitar recursión de RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.venue_admin_can_see_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_my_role() = 'VENUE_ADMIN'
    AND public.get_my_venue_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.facilities f ON f.id = b.facility_id
        WHERE b.user_id = p_profile_id
          AND f.venue_id = public.get_my_venue_id()
      )
      OR EXISTS (
        SELECT 1
        FROM public.recurring_bookings r
        JOIN public.facilities f ON f.id = r.facility_id
        WHERE r.user_id = p_profile_id
          AND f.venue_id = public.get_my_venue_id()
      )
    );
$$;

DROP POLICY IF EXISTS "profiles_select_venue_admin" ON public.profiles;

CREATE POLICY "profiles_select_venue_admin"
  ON public.profiles
  FOR SELECT
  USING (public.venue_admin_can_see_profile(id));
