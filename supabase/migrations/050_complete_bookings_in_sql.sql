-- SportBooking — Completar turnos jugados dentro de la base, cada 5 minutos
-- Migración: 050_complete_bookings_in_sql.sql
--
-- Antes: pg_cron llamaba por HTTP a la Edge Function cron-complete-bookings una vez por hora
-- (a los :30). El complejo veía su ganancia hasta 1 hora después de terminado el turno.
--
-- Ahora: una función SQL hace lo mismo sin salir de la base (sin HTTP ni arranque de la
-- función) y pg_cron la corre cada 5 minutos. Cuando no hay turnos para completar, la
-- búsqueda usa el índice parcial idx_bookings_cron_complete y no cuesta casi nada.
--
-- Hace lo mismo que la Edge Function:
--   1. CONFIRMED + PAID con fin ya pasado -> COMPLETED. El trigger credit_venue_on_complete
--      (043/045) acredita el precio base a la sede, una sola vez.
--   2. Aviso "Comisión generada" al admin general, uno por sede.
-- Idempotente: solo toma las que siguen CONFIRMED; las que otra transacción tiene bloqueadas
-- (ej. una cancelación en curso) se saltean y quedan para la próxima vuelta.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_past_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r       record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _completed (venue_name text, commission numeric) ON COMMIT DROP;
  TRUNCATE _completed;

  WITH due AS (
    SELECT b.id
      FROM public.bookings b
     WHERE b.status = 'CONFIRMED'
       AND b.payment_status = 'PAID'
       AND b.end_datetime < now()
     FOR UPDATE SKIP LOCKED
  ), done AS (
    UPDATE public.bookings b
       SET status = 'COMPLETED', updated_at = now()
      FROM due
     WHERE b.id = due.id
    RETURNING b.facility_id, b.commission_amount
  )
  INSERT INTO _completed (venue_name, commission)
  SELECT v.name, coalesce(d.commission_amount, 0)
    FROM done d
    JOIN public.facilities f ON f.id = d.facility_id
    JOIN public.venues v ON v.id = f.venue_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Un aviso por sede al admin general (mismo texto que la Edge Function, montos con coma)
  FOR r IN
    SELECT venue_name, sum(commission) AS commission
      FROM _completed
     GROUP BY venue_name
    HAVING sum(commission) > 0
  LOOP
    INSERT INTO public.notifications (type, title, body, venue_id, admin_only, data)
    VALUES ('COMMISSION_EARNED', 'Comisión generada',
            'Se reconoció $' || public.fmt_points(round(r.commission)::bigint) || ' de comisión en ' || r.venue_name || '.',
            NULL, true,
            jsonb_build_object('sede', r.venue_name, 'comision', round(r.commission)));
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_past_bookings() FROM PUBLIC, anon, authenticated;

-- Reemplazar el job: fuera la llamada HTTP horaria, adentro la función SQL cada 5 minutos
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('cron-complete-bookings', 'complete-past-bookings');
  PERFORM cron.schedule('complete-past-bookings', '*/5 * * * *', 'SELECT public.complete_past_bookings()');
END $$;

-- pg_cron guarda un registro por cada ejecución (cron.job_run_details). Con jobs cada 5 y
-- 10 minutos son miles de filas por mes: se borran las de más de 7 días, una vez por día.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-cron-history';
  PERFORM cron.schedule('purge-cron-history', '15 3 * * *',
    $q$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$q$);
END $$;

-- Nombre del cliente en el movimiento de la sede sin espacios dobles (ej. "Matias  Bassi").
-- Resto idéntico a 045.
CREATE OR REPLACE FUNCTION public.credit_venue_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue  uuid;
  v_base   bigint;
  v_client text;
BEGIN
  SELECT f.venue_id INTO v_venue FROM public.facilities f WHERE f.id = NEW.facility_id;
  v_base := round(coalesce(NEW.base_price, 0))::bigint;
  IF v_venue IS NULL OR v_base <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT regexp_replace(btrim(first_name || ' ' || last_name), '\s+', ' ', 'g') INTO v_client
    FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.venue_ledger (venue_id, kind, amount, commission, period, booking_id, detail)
  VALUES (v_venue, 'BOOKING_CREDIT', v_base, greatest(round(coalesce(NEW.commission_amount, 0))::bigint, 0),
          public.ar_month(NEW.end_datetime - interval '1 microsecond'), NEW.id,
          left('Turno jugado — ' || coalesce(public.booking_label(NEW.id), 'Reserva')
               || coalesce(' · ' || NULLIF(v_client, ''), ''), 300))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
