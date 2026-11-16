-- SportBooking — Turnos fijos con hora de fin "24:00"
-- Migración: 055_fix_recurring_end_24.sql
--
-- El frontend mandaba la hora de fin sin envolver: un turno de 23:00 de 60 min quedaba
-- "23:00 a 24:00" (debía ser "00:00"). No cambiaba cuándo se juega (las reservas tienen el
-- instante correcto), pero se mostraba "24:00". create-recurring ahora normaliza la hora;
-- acá se corrigen los turnos fijos y avisos ya guardados.
-- ============================================================

UPDATE public.recurring_bookings
   SET start_time = lpad((split_part(start_time, ':', 1)::int % 24)::text, 2, '0') || ':' || split_part(start_time, ':', 2),
       end_time   = lpad((split_part(end_time,   ':', 1)::int % 24)::text, 2, '0') || ':' || split_part(end_time,   ':', 2),
       updated_at = now()
 WHERE split_part(start_time, ':', 1)::int >= 24 OR split_part(end_time, ':', 1)::int >= 24;

UPDATE public.notifications
   SET body = regexp_replace(regexp_replace(regexp_replace(body,
                '\m24:(\d{2})\M', '00:\1', 'g'),
                '\m25:(\d{2})\M', '01:\1', 'g'),
                '\m26:(\d{2})\M', '02:\1', 'g')
 WHERE type = 'RECURRING_CREATED' AND body ~ '\m2[4-6]:\d{2}\M';
