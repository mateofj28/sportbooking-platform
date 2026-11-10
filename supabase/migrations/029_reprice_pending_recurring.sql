-- SportBooking — Recalcular el precio de las fechas pendientes de un turno fijo al cambiar la tarifa
-- Migración: 029_reprice_pending_recurring.sql
--
-- Regla acordada (ver .kiro/steering/negocio.md):
--   * Cada reserva guarda su precio al crearse. Si cambia la tarifa de la cancha, se
--     recalculan SOLO las fechas de TURNO FIJO que estén:
--       CONFIRMED + payment_status = 'PENDING' + con inicio a MÁS DE 48 h.
--   * Por qué 48 h: el cron cancela las impagas a menos de 24 h y el cliente solo puede
--     cancelar con 24 h o más. Con 48 h el cliente siempre tiene al menos un día para
--     pagar el precio nuevo o cancelar.
--   * Nunca se tocan reservas pagadas, pasadas, canceladas ni reservas únicas.
--   * Sube o baja con la misma regla.
--   * Si una fecha queda sin tarifa que la cubra, conserva su precio anterior.
--   * Se avisa al cliente (email + aviso en la app) con "antes / ahora". Varios cambios
--     seguidos se agrupan en un solo aviso; si el precio vuelve al original antes de
--     avisar, no se avisa.
--
-- Piezas:
--   1. booking_price_changes: un registro por reserva con el cambio pendiente de avisar
--      (old_total = el precio que el cliente conocía; new_total = el actual).
--   2. reprice_pending_recurring(facility): recalcula con calculate_price().
--   3. Trigger sobre pricing (alta, cambio, baja) -> recalcula la cancha afectada.
--   4. pg_cron cada 5 min -> Edge Function cron-notify-price-changes (envía los avisos
--      que llevan >= 5 min sin cambios). El job se arma copiando la autorización de un
--      cron existente: la clave secreta no se escribe en este archivo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cambios de precio pendientes de avisar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_price_changes (
  booking_id  uuid          PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id     uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_total   numeric(10,2) NOT NULL,   -- precio que el cliente conocía (último avisado o el original)
  new_total   numeric(10,2) NOT NULL,   -- precio vigente de la reserva
  currency    text          NOT NULL DEFAULT 'ARS',
  changed_at  timestamptz   NOT NULL DEFAULT now(),  -- último cambio (para agrupar avisos)
  notified_at timestamptz,                           -- NULL = falta avisar
  CONSTRAINT booking_price_changes_differs CHECK (old_total <> new_total)
);

CREATE INDEX IF NOT EXISTS idx_booking_price_changes_user    ON public.booking_price_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_price_changes_pending ON public.booking_price_changes(changed_at)
  WHERE notified_at IS NULL;

ALTER TABLE public.booking_price_changes ENABLE ROW LEVEL SECURITY;

-- El cliente ve los cambios de SUS reservas (para el aviso en la app). Nadie escribe
-- desde la API: solo la función de recálculo (SECURITY DEFINER) y el cron (service_role).
DROP POLICY IF EXISTS "booking_price_changes_select_own" ON public.booking_price_changes;
CREATE POLICY "booking_price_changes_select_own" ON public.booking_price_changes
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Recalcular las fechas pendientes de una cancha
-- ------------------------------------------------------------
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
    EXCEPTION WHEN OTHERS THEN
      -- Sin tarifa activa para ese horario (o cancha inactiva): conserva su precio
      CONTINUE;
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

    -- El cliente solo ve el total: si el total no cambió (ej. se repartió distinto
    -- entre base y comisión), no hay nada que avisarle.
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
     -- Si con este cambio el precio vuelve al que el cliente conocía, no se actualiza:
     -- se borra abajo sin avisar (el CHECK old <> new no permitiría guardarlo).
     WHERE (CASE WHEN c.notified_at IS NULL THEN c.old_total ELSE EXCLUDED.old_total END) <> EXCLUDED.new_total;

    -- Volvió al precio que el cliente conocía antes de que se le avisara: no avisar
    DELETE FROM public.booking_price_changes
     WHERE booking_id = b.id AND notified_at IS NULL AND old_total = v_total;
  END LOOP;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.reprice_pending_recurring(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Trigger: cualquier cambio de tarifa recalcula su cancha
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pricing_changed_reprice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.reprice_pending_recurring(OLD.facility_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.facility_id IS DISTINCT FROM OLD.facility_id) THEN
    PERFORM public.reprice_pending_recurring(NEW.facility_id);
  END IF;
  RETURN NULL;  -- AFTER trigger
END;
$$;

REVOKE ALL ON FUNCTION public.pricing_changed_reprice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pricing_changed_reprice ON public.pricing;
CREATE TRIGGER pricing_changed_reprice
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.pricing_changed_reprice();

-- ------------------------------------------------------------
-- 4. Cron de avisos (cada 5 minutos)
--    Se copia el comando de un cron existente (misma URL base y autorización) y solo
--    se cambia el nombre de la función, para no escribir la clave secreta acá.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_template text;
BEGIN
  SELECT command INTO v_template FROM cron.job WHERE jobname = 'cron-send-reminders';
  IF v_template IS NULL THEN
    RAISE WARNING 'No existe el cron cron-send-reminders: crear cron-notify-price-changes a mano';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-notify-price-changes';
  PERFORM cron.schedule(
    'cron-notify-price-changes',
    '*/5 * * * *',
    replace(v_template, 'cron-send-reminders', 'cron-notify-price-changes')
  );
END $$;
