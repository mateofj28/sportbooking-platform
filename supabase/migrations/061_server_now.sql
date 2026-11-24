-- ============================================================
-- 061 · Hora del servidor para el frontend
-- La app compara la hora de la PC con esta para corregir relojes atrasados o adelantados
-- (lib/clock.ts). No expone datos: solo devuelve now().
-- clock_timestamp() (y no now()) para que no quede fija al inicio de la transacción.
-- ============================================================
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$ SELECT clock_timestamp() $$;

REVOKE ALL ON FUNCTION public.server_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
