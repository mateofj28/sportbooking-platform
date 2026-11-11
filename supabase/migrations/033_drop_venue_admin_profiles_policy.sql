-- SportBooking — El admin de sede deja de leer perfiles ajenos completos
-- Migración: 033_drop_venue_admin_profiles_policy.sql
--
-- La política profiles_select_venue_admin (014) le daba al admin de sede la fila
-- COMPLETA del perfil de sus clientes (DNI, teléfono…). Desde 032 el frontend lee nombre
-- y email de otras personas por la vista profile_directory, así que la política ya no
-- hace falta.
--
-- IMPORTANTE: se aplica DESPUÉS de publicar el frontend que usa profile_directory.
-- Reversible: recrear la política de 014.
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_venue_admin" ON public.profiles;
