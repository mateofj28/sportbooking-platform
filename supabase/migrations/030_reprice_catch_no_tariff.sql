-- SportBooking — Corrección de reprice_pending_recurring (029)
-- Migración: 030_reprice_catch_no_tariff.sql
--
-- Problema: calculate_price avisa "sin tarifa activa" con SQLSTATE P0004, que en
-- PostgreSQL es assert_failure. "WHEN OTHERS" NO atrapa assert_failure (ni
-- query_canceled) a propósito. Resultado: al desactivar o borrar la única tarifa que
-- cubría una fecha pendiente, el error se propagaba y el cambio de tarifa fallaba,
-- en vez de que la fecha conservara su precio (regla acordada).
--
-- Solución: atrapar assert_failure explícitamente además de OTHERS. Resto idéntico a 029.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reprice_pending_recurring(p_facility_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER            -- bookings no tiene políticas de escritura (028): corre como dueño
SET search_path = public
AS $$
DECLARE
  v_min_start constant interval := interval '48 hours';
  b           record;
  v_price     json;
  v_base      numeric(10,2);
  v_comm      numeric(10,2);
  v_total     numeric(10,2);
  v_changed   integer := 0;
BEGIN
  IF p_facility_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR b IN
    SELECT id, user_id, start_datetime, base_price, commission_amount, total_price, currency
    FROM public.bookings
    WHERE facility_id = p_facility_id
      AND recurring_booking_id IS NOT NULL
      AND status = 'CONFIRMED'
      AND payment_status = 'PENDING'
      AND start_datetime > now() + v_min_start
    FOR UPDATE                -- no competir con un pago en curso de la misma reserva
  LOOP
    BEGIN
      v_price := public.calculate_price(p_facility_id, b.start_datetime);
    EXCEPTION
      -- Sin tarifa activa para ese horario (P0004 = assert_failure, que OTHERS no atrapa)
      WHEN assert_failure THEN CONTINUE;
      -- Cancha inactiva / no encontrada u otro error: conserva su precio
      WHEN OTHERS THEN CONTINUE;
    END;

    v_base  := (v_price ->> 'base_price')::numeric;
    v_comm  := (v_price ->> 'commission_amount')::numeric;
    v_total := (v_price ->> 'total_price')::numeric;

    IF v_base = b.base_price AND v_comm = b.commission_amount AND v_total = b.total_price THEN
      CONTINUE;  -- nada que cambiar
    END IF;

    UPDATE public.bookings
       SET base_price = v_base, commission_amount = v_comm, total_price = v_total, updated_at = now()
     WHERE id = b.id;
    v_changed := v_changed + 1;

    -- El cliente solo ve el total: si el total no cambió, no hay nada que avisarle.
    IF v_total = b.total_price THEN
      CONTINUE;
    END IF;

    -- Registrar "antes / ahora". Si ya había un cambio sin avisar, se conserva el
    -- precio que el cliente conocía (old_total) y se actualiza el actual.
    INSERT INTO public.booking_price_changes AS c (booking_id, user_id, old_total, new_total, currency)
    VALUES (b.id, b.user_id, b.total_price, v_total, coalesce(b.currency, 'ARS'))
    ON CONFLICT (booking_id) DO UPDATE
       SET old_total   = CASE WHEN c.notified_at IS NULL THEN c.old_total ELSE EXCLUDED.old_total END,
           new_total   = EXCLUDED.new_total,
           changed_at  = now(),
           notified_at = NULL
     WHERE (CASE WHEN c.notified_at IS NULL THEN c.old_total ELSE EXCLUDED.old_total END) <> EXCLUDED.new_total;

    -- Volvió al precio que el cliente conocía antes de que se le avisara: no avisar
    DELETE FROM public.booking_price_changes
     WHERE booking_id = b.id AND notified_at IS NULL AND old_total = v_total;
  END LOOP;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.reprice_pending_recurring(uuid) FROM PUBLIC, anon, authenticated;
