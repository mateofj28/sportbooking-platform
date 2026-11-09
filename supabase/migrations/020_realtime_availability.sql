-- SportBooking — Aviso en tiempo real de cambios de disponibilidad
-- Migración: 020_realtime_availability.sql
--
-- Problema: la pantalla de reserva de una cancha no se enteraba cuando otro
-- usuario reservaba o cancelaba; el horario seguía bloqueado hasta recargar.
--
-- Por qué NO postgres_changes sobre bookings: Realtime respeta RLS y un CLIENT
-- solo puede leer SUS reservas, así que nunca recibiría la cancelación de otro.
-- Abrir el RLS para eso expondría datos de otros clientes.
--
-- Solución (patrón "Broadcast from Database"): un trigger emite un aviso mínimo
-- al canal público `availability:<facility_id>` con el evento `changed`.
--   * El payload lleva SOLO el id de la cancha y la tabla: sin datos personales.
--   * El cliente, al recibirlo, vuelve a pedir la disponibilidad (RPC
--     get_availability), que es la única fuente de verdad.
--   * Se emite solo cuando cambia algo que afecta la disponibilidad
--     (no en cada UPDATE, ej. reminder_sent_at no dispara aviso).
--   * Best-effort: si Realtime falla, la escritura NO se revierte.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_availability_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- realtime.messages no es escribible por authenticated
SET search_path = public
AS $$
DECLARE
  v_facility_ids uuid[];
  v_id           uuid;
BEGIN
  -- En bookings, solo avisar si cambió algo que afecta los slots
  IF TG_TABLE_NAME = 'bookings' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.start_datetime IS NOT DISTINCT FROM OLD.start_datetime
       AND NEW.end_datetime   IS NOT DISTINCT FROM OLD.end_datetime
       AND NEW.facility_id    IS NOT DISTINCT FROM OLD.facility_id THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Cancha(s) afectada(s): la nueva y, si se movió, también la anterior
  IF TG_OP = 'DELETE' THEN
    v_facility_ids := ARRAY[OLD.facility_id];
  ELSIF TG_OP = 'UPDATE' AND NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
    v_facility_ids := ARRAY[NEW.facility_id, OLD.facility_id];
  ELSE
    v_facility_ids := ARRAY[NEW.facility_id];
  END IF;

  FOREACH v_id IN ARRAY v_facility_ids LOOP
    CONTINUE WHEN v_id IS NULL;
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('facility_id', v_id, 'source', TG_TABLE_NAME),
        'changed',
        'availability:' || v_id::text,
        false                 -- canal público: el payload no tiene datos sensibles
      );
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort: nunca romper la reserva/cancelación por Realtime
      RAISE WARNING 'notify_availability_changed: %', SQLERRM;
    END;
  END LOOP;

  RETURN NULL;  -- AFTER trigger
END;
$$;

REVOKE ALL ON FUNCTION public.notify_availability_changed() FROM PUBLIC, anon, authenticated;

-- Reservas: alta, cancelación (UPDATE de status), cambio de horario, borrado
DROP TRIGGER IF EXISTS availability_changed ON public.bookings;
CREATE TRIGGER availability_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_availability_changed();

-- Bloqueos manuales
DROP TRIGGER IF EXISTS availability_changed ON public.blocked_slots;
CREATE TRIGGER availability_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.blocked_slots
  FOR EACH ROW EXECUTE FUNCTION public.notify_availability_changed();

-- Horarios y tarifas también cambian qué slots se ofrecen
DROP TRIGGER IF EXISTS availability_changed ON public.schedules;
CREATE TRIGGER availability_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.notify_availability_changed();

DROP TRIGGER IF EXISTS availability_changed ON public.pricing;
CREATE TRIGGER availability_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.notify_availability_changed();
