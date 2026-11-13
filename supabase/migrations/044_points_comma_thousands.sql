-- SportBooking — Puntos con coma de miles en los mensajes de la base
-- Migración: 044_points_comma_thousands.sql
--
-- La app muestra montos con coma de miles ("57,750"), igual que los precios. Los mensajes
-- de error de la billetera (043, ej. "Saldo insuficiente: necesitás 57.750…") usaban punto.
-- fmt_points pasa a coma; las funciones que la usan no cambian.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fmt_points(p bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(p, 'FM999,999,999,990');
$$;
