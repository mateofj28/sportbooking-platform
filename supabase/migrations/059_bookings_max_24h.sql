-- ============================================================
-- 059 · Ningún turno dura más de 24 horas
--
-- El dashboard pide las reservas de un día con una ventana acotada: inicio entre las 00:00 AR
-- del día anterior y el fin del día (hook useDashboardDayBookings). Así la consulta usa el
-- índice de start_datetime en vez de recorrer todo el historial. Para que esa ventana no
-- pierda reservas, la base garantiza que un turno no pasa de 24 h (hoy el máximo configurado
-- en una cancha es 90 min y la reserva más larga registrada dura 60 min).
-- ============================================================
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_max_24h;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_max_24h CHECK (end_datetime - start_datetime <= interval '24 hours') NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_max_24h;
