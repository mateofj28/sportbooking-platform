-- SportBooking — Integridad de reservas en la base
-- Migración: 025_bookings_integrity.sql
--
-- Problemas (create-booking / create-recurring):
--   1. Doble reserva por concurrencia: la Edge Function primero CONSULTA si hay
--      conflicto y después INSERTA, en dos pasos. Dos clientes que confirman el
--      mismo turno a la vez pasan ambos la consulta y se crean dos reservas.
--   2. No se validaba el horario de la cancha: llamando a la API directamente se
--      podía reservar fuera del horario de apertura (regla 4.2.5).
--   3. create-recurring no revisaba los bloqueos manuales.
--
-- Solución (la base es la que garantiza; las Edge Functions solo dan buenos mensajes):
--   A. Restricción de EXCLUSIÓN: dos reservas CONFIRMED de la misma cancha no
--      pueden superponerse. Postgres la hace cumplir incluso entre transacciones
--      concurrentes (la segunda falla con 23P01), sin carreras posibles.
--      Intervalo semiabierto [inicio, fin): un turno que termina 20:00 y otro que
--      empieza 20:00 NO chocan.
--   B. Trigger BEFORE INSERT (solo reservas CONFIRMED nuevas):
--      - el turno debe caer DENTRO de un horario activo de la cancha, en hora AR.
--        Se prueba el horario del mismo día y el del día anterior, porque un horario
--        que cruza medianoche (12:00 -> 02:00) cubre la madrugada del día siguiente.
--        Misma regla que generateTimeSlots() y get_availability.
--      - no debe superponerse con un bloqueo (blocked_slots).
--      Solo INSERT: las reservas existentes no se revalidan si después cambia el horario.
--
-- Códigos de error (los mapean las Edge Functions):
--   23P01 exclusion_violation -> "El horario ya está reservado" (409)
--   23514 check_violation     -> mensaje del trigger (fuera de horario / bloqueado)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- A. Sin superposición de reservas activas en la misma cancha
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    facility_id extensions.gist_uuid_ops WITH =,
    tstzrange(start_datetime, end_datetime, '[)') WITH &&
  )
  WHERE (status = 'CONFIRMED');

-- B. Horario de la cancha y bloqueos
CREATE OR REPLACE FUNCTION public.validate_booking_slot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tz          constant text := 'America/Argentina/Buenos_Aires';
  v_local_start timestamp;
  v_local_end   timestamp;
BEGIN
  IF NEW.status IS DISTINCT FROM 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  IF NEW.end_datetime <= NEW.start_datetime THEN
    RAISE EXCEPTION 'La hora de fin debe ser posterior a la de inicio' USING ERRCODE = '23514';
  END IF;

  v_local_start := NEW.start_datetime AT TIME ZONE v_tz;
  v_local_end   := NEW.end_datetime   AT TIME ZONE v_tz;

  -- Dentro de un horario activo: el del día del turno o el del día anterior (cruce de medianoche).
  -- day_of_week: 0 = lunes ... 6 = domingo (isodow - 1).
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedules s
    CROSS JOIN (VALUES (v_local_start::date), (v_local_start::date - 1)) AS d(day)
    WHERE s.facility_id = NEW.facility_id
      AND s.is_active
      AND s.day_of_week = extract(isodow FROM d.day)::int - 1
      AND v_local_start >= d.day + s.open_time::time
      AND v_local_end   <= d.day + s.close_time::time
                           + CASE WHEN s.close_time::time <= s.open_time::time
                                  THEN interval '1 day' ELSE interval '0' END
  ) THEN
    RAISE EXCEPTION 'El turno está fuera del horario de la cancha' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_slots bs
    WHERE bs.facility_id = NEW.facility_id
      AND bs.start_datetime < NEW.end_datetime
      AND bs.end_datetime   > NEW.start_datetime
  ) THEN
    RAISE EXCEPTION 'El horario está bloqueado' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_booking_slot ON public.bookings;
CREATE TRIGGER validate_booking_slot
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_slot();
