-- SportBooking — Endurecimiento de la publicidad (hallazgos de supabase db advisors)
-- Migración: 016_advertisements_hardening.sql
--
--  1. search_path fijo en las funciones nuevas (evita que un schema
--     malicioso en el search_path del llamador las secuestre).
--  2. get_active_advertisements solo para usuarios autenticados: el home
--     del cliente exige sesión, no hay motivo para exponerla a anon
--     (mínimo privilegio). Se la había abierto para poder probarla.
-- ============================================================

ALTER FUNCTION public.ar_province_codes()        SET search_path = public;
ALTER FUNCTION public.normalize_advertisement()  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_active_advertisements(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_advertisements(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_active_advertisements(text) TO authenticated;
