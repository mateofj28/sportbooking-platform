-- ============================================================
-- 062 · Estadísticas del cliente: cantidad de reservas por estado de negocio
--
-- Solo las reservas PROPIAS (user_id = auth.uid()), igual que "Mis reservas": un admin que
-- usa la app como cliente ve las suyas, no el alcance de administración.
-- Estados de negocio (negocio.md):
--   Realizada  = pagada y el turno todavía no terminó
--   Completada = COMPLETED, o pagada cuyo fin ya pasó (aunque el cron todavía no corrió)
--   Cancelada  = un turno que se había pagado y se canceló (conserva paid_at)
--   Reservas   = Realizadas + Completadas + Canceladas
-- Las fechas de turno fijo que nunca se pagaron no son reservas hechas: no cuentan
-- (ni las pendientes de pago ni las que se cancelaron solas por falta de pago).
-- Cuenta en la base con el índice de user_id: no se descarga la lista.
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_booking_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH s AS (
    SELECT
      count(*) FILTER (WHERE status = 'CONFIRMED' AND payment_status = 'PAID' AND end_datetime > now())           AS realizadas,
      count(*) FILTER (WHERE status = 'COMPLETED'
                          OR (status = 'CONFIRMED' AND payment_status = 'PAID' AND end_datetime <= now()))        AS completadas,
      count(*) FILTER (WHERE status = 'CANCELLED' AND paid_at IS NOT NULL)                                        AS canceladas
    FROM public.bookings
    WHERE user_id = auth.uid()
  )
  SELECT json_build_object(
    'total',       realizadas + completadas + canceladas,
    'realizadas',  realizadas,
    'completadas', completadas,
    'canceladas',  canceladas
  )
  FROM s;
$$;

REVOKE ALL ON FUNCTION public.my_booking_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_booking_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
