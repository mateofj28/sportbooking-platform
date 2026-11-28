-- ============================================================
-- 069 — Entrenadores, Etapa 4: dinero, avisos y estadísticas
-- (spec .kiro/specs/entrenadores, Req. 10.3–10.5, 11.3–11.5, 12, 13.4; E18, E22; design 2.6, 2.7)
--
-- Dinero (paralelo exacto a los complejos, 045/050/056/057):
--   - Clase pagada y terminada -> COMPLETED (complete_past_classes, pg_cron cada 5 min) y el trigger
--     acredita al entrenador su tarifa (base) en trainer_ledger; la comisión queda registrada aparte.
--   - El entrenador solicita su pago (una pendiente a la vez); el admin general lo paga (con número de
--     transferencia o comprobante) o lo rechaza con motivo.
--   - business_totals (057) suma lo de entrenadores: Balances sigue cuadrando.
-- Avisos: notifications suma trainer_id / trainer_only; el entrenador ve los suyos; el admin general
--   no ve los trainer_only; el admin de sede no ve nada de entrenadores (venue_id NULL).
-- Estadísticas: get_trainer_stats (admin general: todo; entrenador: lo suyo, sin comisión) y
--   my_booking_stats con las clases del cliente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas de dinero
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.trainer_ledger_kind AS ENUM ('CLASS_CREDIT', 'SETTLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.trainer_settlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id   uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE RESTRICT,
  amount       bigint NOT NULL CHECK (amount > 0),
  transfer_ref text CHECK (transfer_ref IS NULL OR char_length(btrim(transfer_ref)) BETWEEN 1 AND 120),
  receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) BETWEEN 1 AND 300),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_settlements_receipt CHECK (transfer_ref IS NOT NULL OR receipt_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_trainer_settlements_trainer ON public.trainer_settlements(trainer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_settlements_created ON public.trainer_settlements(created_at DESC);

CREATE TABLE IF NOT EXISTS public.trainer_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id       uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE RESTRICT,
  kind             public.trainer_ledger_kind NOT NULL,
  amount           bigint NOT NULL CHECK (amount <> 0),
  commission       bigint NOT NULL DEFAULT 0 CHECK (commission >= 0),
  class_booking_id uuid REFERENCES public.class_bookings(id) ON DELETE SET NULL,
  settlement_id    uuid REFERENCES public.trainer_settlements(id) ON DELETE RESTRICT,
  detail           text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 300),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_ledger_shape CHECK (
       (kind = 'CLASS_CREDIT' AND amount > 0 AND settlement_id IS NULL)
    OR (kind = 'SETTLEMENT'   AND amount < 0 AND commission = 0 AND settlement_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_ledger_one_credit ON public.trainer_ledger(class_booking_id) WHERE kind = 'CLASS_CREDIT';
CREATE INDEX IF NOT EXISTS idx_trainer_ledger_trainer_created ON public.trainer_ledger(trainer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.trainer_payout_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id    uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE RESTRICT,
  amount        bigint NOT NULL CHECK (amount > 0),
  status        public.payout_request_status NOT NULL DEFAULT 'PENDING',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  reject_reason text CHECK (reject_reason IS NULL OR char_length(btrim(reject_reason)) BETWEEN 3 AND 300),
  settlement_id uuid REFERENCES public.trainer_settlements(id) ON DELETE RESTRICT,
  CONSTRAINT trainer_payout_request_shape CHECK (
       (status = 'PENDING'  AND resolved_at IS NULL     AND settlement_id IS NULL     AND reject_reason IS NULL)
    OR (status = 'PAID'     AND resolved_at IS NOT NULL AND settlement_id IS NOT NULL AND reject_reason IS NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND settlement_id IS NULL     AND reject_reason IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_payout_one_pending ON public.trainer_payout_requests(trainer_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_trainer_payout_requests_trainer ON public.trainer_payout_requests(trainer_id, requested_at DESC);

-- Sin políticas: se leen y escriben solo con las funciones de abajo (la comisión no le llega al entrenador)
ALTER TABLE public.trainer_settlements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_payout_requests ENABLE ROW LEVEL SECURITY;

-- Recordatorio al entrenador (una vez por clase)
ALTER TABLE public.trainer_classes ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Comprobantes: trainers/<trainer_id>/archivo. El entrenador ve solo los suyos (la carga es del admin, 043).
DROP POLICY IF EXISTS "receipts_read_trainer" ON storage.objects;
CREATE POLICY "receipts_read_trainer" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'settlement-receipts'
    AND (storage.foldername(name))[1] = 'trainers'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.get_my_role() = 'TRAINER'
  );

-- ------------------------------------------------------------
-- 2. Avisos (design 2.7)
-- ------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS trainer_only boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_notifications_type_created ON public.notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_trainer_created ON public.notifications(trainer_id, created_at DESC) WHERE trainer_id IS NOT NULL;

DROP POLICY IF EXISTS "notifications_select_admin" ON public.notifications;
CREATE POLICY "notifications_select_admin" ON public.notifications
  FOR SELECT USING (public.is_admin() AND NOT trainer_only);
DROP POLICY IF EXISTS "notifications_select_trainer" ON public.notifications;
CREATE POLICY "notifications_select_trainer" ON public.notifications
  FOR SELECT USING (trainer_id IS NOT NULL AND trainer_id = auth.uid());

-- Emite un aviso de entrenadores. p_group agrupa los avisos de una MISMA transacción (ej. cancelar
-- una clase fija entera no manda 7 avisos): el segundo suma 1 al contador y usa p_body_many ({n}).
-- p_actor: quien hizo la acción, ya lo ve como leído.
CREATE OR REPLACE FUNCTION public.emit_trainer_notification(
  p_type public.notification_type, p_title text, p_body text, p_body_many text,
  p_trainer uuid, p_trainer_only boolean, p_admin_only boolean, p_data jsonb, p_actor uuid, p_group text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx text := pg_current_xact_id()::text;
  v_id uuid;
  v_n  int;
BEGIN
  IF p_group IS NOT NULL THEN
    SELECT id, coalesce((data ->> 'count')::int, 1) INTO v_id, v_n
      FROM public.notifications
     WHERE type = p_type AND created_at >= now() AND data ->> 'group' = p_group AND data ->> 'tx' = v_tx
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.notifications
         SET body = left(replace(coalesce(p_body_many, p_body), '{n}', (v_n + 1)::text), 500),
             data = data || jsonb_build_object('count', v_n + 1)
       WHERE id = v_id;
      RETURN;
    END IF;
  END IF;
  INSERT INTO public.notifications (type, title, body, venue_id, admin_only, trainer_id, trainer_only, data)
  VALUES (p_type, left(p_title, 200), left(p_body, 500), NULL, p_admin_only, p_trainer, p_trainer_only,
          coalesce(p_data, '{}'::jsonb) || jsonb_build_object('group', p_group, 'tx', v_tx, 'count', 1))
  RETURNING id INTO v_id;
  IF p_actor IS NOT NULL THEN
    INSERT INTO public.notification_reads (notification_id, user_id) VALUES (v_id, p_actor) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.person_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT regexp_replace(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '\s+', ' ', 'g')
    FROM public.profiles WHERE id = p_user;
$$;

-- Entrenador publicado -> admin general
CREATE OR REPLACE FUNCTION public.notify_trainer_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' AND OLD.status IS DISTINCT FROM 'PUBLISHED' THEN
    PERFORM public.emit_trainer_notification('TRAINER_PUBLISHED', 'Entrenador publicado',
      coalesce(public.person_name(NEW.user_id), 'Un entrenador') || ' publicó su perfil: los clientes ya lo ven.', NULL,
      NULL, false, true, jsonb_build_object('trainerId', NEW.user_id), NULL, NULL);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_trainer_published ON public.trainers;
CREATE TRIGGER notify_trainer_published AFTER UPDATE OF status ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.notify_trainer_published();

-- Reserva de clase -> entrenador y admin general (las fechas de una clase fija, en un solo aviso)
CREATE OR REPLACE FUNCTION public.notify_class_booked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  SELECT k.trainer_id, k.start_datetime, sp.name AS sport INTO c
    FROM public.trainer_classes k JOIN public.sports sp ON sp.id = k.sport_id WHERE k.id = NEW.class_id;
  PERFORM public.emit_trainer_notification('CLASS_BOOKED',
    CASE WHEN NEW.recurring_class_id IS NULL THEN 'Clase reservada' ELSE 'Clase fija reservada' END,
    coalesce(public.person_name(NEW.user_id), 'Un alumno') || ' reservó ' || c.sport || ' el '
      || public.fmt_ar_datetime(c.start_datetime) || '.',
    coalesce(public.person_name(NEW.user_id), 'Un alumno') || ' reservó una clase fija de ' || c.sport
      || ': {n} fechas desde el ' || public.fmt_ar_datetime(c.start_datetime) || '.',
    c.trainer_id, false, false,
    jsonb_build_object('classId', NEW.class_id, 'classBookingId', NEW.id, 'trainerId', c.trainer_id),
    NEW.created_by,
    CASE WHEN NEW.recurring_class_id IS NOT NULL THEN 'series:' || NEW.recurring_class_id END);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_class_booked ON public.class_bookings;
CREATE TRIGGER notify_class_booked AFTER INSERT ON public.class_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_class_booked();

-- Cancelación -> entrenador y admin general, indicando quién (Req. 11.5, 12.2)
CREATE OR REPLACE FUNCTION public.notify_class_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c      record;
  v_who  text;
  v_type public.notification_type;
BEGIN
  IF NEW.status <> 'CANCELLED' OR OLD.status = 'CANCELLED' THEN
    RETURN NULL;
  END IF;
  SELECT k.trainer_id, k.start_datetime, sp.name AS sport INTO c
    FROM public.trainer_classes k JOIN public.sports sp ON sp.id = k.sport_id WHERE k.id = NEW.class_id;
  v_who := CASE NEW.cancelled_by_role
             WHEN 'CLIENT'  THEN 'el alumno'
             WHEN 'TRAINER' THEN 'el entrenador'
             WHEN 'ADMIN'   THEN 'la administración'
             ELSE 'el sistema' END;
  v_type := CASE WHEN NEW.cancelled_by_role = 'SYSTEM' THEN 'CLASS_AUTO_CANCELLED' ELSE 'CLASS_CANCELLED' END;
  PERFORM public.emit_trainer_notification(v_type,
    CASE WHEN v_type = 'CLASS_AUTO_CANCELLED' THEN 'Clase cancelada automáticamente' ELSE 'Clase cancelada' END,
    c.sport || ' del ' || public.fmt_ar_datetime(c.start_datetime) || ' · ' || coalesce(public.person_name(NEW.user_id), 'alumno')
      || ' · la canceló ' || v_who || coalesce(': ' || NEW.cancellation_reason, '') || '.',
    'Se cancelaron {n} lugares de clases de ' || c.sport || ' (los canceló ' || v_who || ')'
      || coalesce(': ' || NEW.cancellation_reason, '') || '.',
    c.trainer_id, false, false,
    jsonb_build_object('classId', NEW.class_id, 'classBookingId', NEW.id, 'trainerId', c.trainer_id, 'by', NEW.cancelled_by_role),
    NEW.cancelled_by,
    'cancel:' || c.trainer_id || ':' || NEW.cancelled_by_role);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_class_cancelled ON public.class_bookings;
CREATE TRIGGER notify_class_cancelled AFTER UPDATE OF status ON public.class_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_class_cancelled();

-- Solicitudes de pago: nueva -> admin general; rechazada -> el entrenador
CREATE OR REPLACE FUNCTION public.notify_trainer_payout_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := public.person_name(NEW.trainer_id);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
    PERFORM public.emit_trainer_notification('TRAINER_PAYOUT_REQUESTED', 'Solicitud de pago: ' || coalesce(v_name, 'entrenador'),
      'Pidió que le paguen ' || public.fmt_points(NEW.amount) || ' créditos ($' || public.fmt_points(NEW.amount)
        || ' ARS). Pagala o rechazala desde Créditos → Solicitudes de pago → Entrenadores.', NULL,
      NULL, false, true, jsonb_build_object('requestId', NEW.id, 'trainerId', NEW.trainer_id, 'amount', NEW.amount),
      NEW.trainer_id, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
    PERFORM public.emit_trainer_notification('TRAINER_PAYOUT_REJECTED', 'Solicitud de pago rechazada',
      'El pedido de ' || public.fmt_points(NEW.amount) || ' créditos fue rechazado. Motivo: '
        || coalesce(NEW.reject_reason, '—') || '. El monto volvió a tu disponible.', NULL,
      NEW.trainer_id, true, false, jsonb_build_object('requestId', NEW.id, 'amount', NEW.amount), NEW.resolved_by, NULL);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_trainer_payout_request ON public.trainer_payout_requests;
CREATE TRIGGER notify_trainer_payout_request AFTER INSERT OR UPDATE OF status ON public.trainer_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_trainer_payout_request();

CREATE OR REPLACE FUNCTION public.notify_trainer_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_trainer_notification('TRAINER_PAYOUT_PAID', 'Pago recibido: ' || public.fmt_points(NEW.amount) || ' créditos',
    'La empresa te pagó $' || public.fmt_points(NEW.amount) || ' ARS.' || coalesce(' Transferencia ' || NEW.transfer_ref || '.', '')
      || CASE WHEN NEW.receipt_path IS NOT NULL THEN ' El comprobante está en tu Billetera.' ELSE '' END, NULL,
    NEW.trainer_id, true, false, jsonb_build_object('settlementId', NEW.id, 'amount', NEW.amount), NEW.created_by, NULL);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_trainer_paid ON public.trainer_settlements;
CREATE TRIGGER notify_trainer_paid AFTER INSERT ON public.trainer_settlements
  FOR EACH ROW EXECUTE FUNCTION public.notify_trainer_paid();

-- ------------------------------------------------------------
-- 3. Clase terminada: COMPLETED y crédito al entrenador (Req. 10.5)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_trainer_on_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trainer uuid;
  v_base    bigint := round(coalesce(NEW.base_price, 0))::bigint;
BEGIN
  IF v_base <= 0 THEN
    RETURN NULL;
  END IF;
  SELECT trainer_id INTO v_trainer FROM public.trainer_classes WHERE id = NEW.class_id;
  INSERT INTO public.trainer_ledger (trainer_id, kind, amount, commission, class_booking_id, detail)
  VALUES (v_trainer, 'CLASS_CREDIT', v_base, greatest(round(coalesce(NEW.commission_amount, 0))::bigint, 0), NEW.id,
          left('Clase dada — ' || coalesce(public.class_label(NEW.class_id), 'Clase')
               || coalesce(' · ' || NULLIF(public.person_name(NEW.user_id), ''), ''), 300))
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS credit_trainer_on_complete ON public.class_bookings;
CREATE TRIGGER credit_trainer_on_complete AFTER UPDATE OF status ON public.class_bookings
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' AND NEW.payment_status = 'PAID')
  EXECUTE FUNCTION public.credit_trainer_on_complete();

CREATE OR REPLACE FUNCTION public.complete_past_classes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  r       record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _class_done (trainer_id uuid, commission numeric) ON COMMIT DROP;
  TRUNCATE _class_done;

  WITH due AS (
    SELECT cb.id
      FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
     WHERE cb.status = 'CONFIRMED' AND cb.payment_status = 'PAID' AND c.end_datetime < now()
     FOR UPDATE OF cb SKIP LOCKED
  ), done AS (
    UPDATE public.class_bookings cb
       SET status = 'COMPLETED', updated_at = now()
      FROM due
     WHERE cb.id = due.id
    RETURNING cb.class_id, cb.commission_amount
  )
  INSERT INTO _class_done (trainer_id, commission)
  SELECT c.trainer_id, coalesce(d.commission_amount, 0)
    FROM done d JOIN public.trainer_classes c ON c.id = d.class_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- La clase terminó con alumnos que la pagaron
  UPDATE public.trainer_classes c
     SET status = 'COMPLETED', updated_at = now()
   WHERE c.status = 'OPEN' AND c.end_datetime < now()
     AND EXISTS (SELECT 1 FROM public.class_bookings cb WHERE cb.class_id = c.id AND cb.status = 'COMPLETED');

  -- Un aviso por entrenador al admin general
  FOR r IN SELECT trainer_id, sum(commission) AS commission FROM _class_done GROUP BY trainer_id HAVING sum(commission) > 0
  LOOP
    PERFORM public.emit_trainer_notification('COMMISSION_EARNED', 'Comisión generada',
      'Se reconoció $' || public.fmt_points(round(r.commission)::bigint) || ' de comisión en clases de '
        || coalesce(public.person_name(r.trainer_id), 'un entrenador') || '.', NULL,
      NULL, false, true, jsonb_build_object('trainerId', r.trainer_id, 'comision', round(r.commission)), NULL, NULL);
  END LOOP;
  RETURN v_count;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'complete-past-classes';
  PERFORM cron.schedule('complete-past-classes', '*/5 * * * *', 'SELECT public.complete_past_classes()');
END $$;

-- ------------------------------------------------------------
-- 4. Totales de Balances (057) con entrenadores
-- ------------------------------------------------------------
ALTER TABLE public.business_totals_shards ADD COLUMN IF NOT EXISTS pending_to_trainers bigint NOT NULL DEFAULT 0;
ALTER TABLE public.business_totals_shards ADD COLUMN IF NOT EXISTS paid_to_trainers    bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bt_apply_trainer(d_played bigint, d_commission bigint, d_pending bigint, d_paid bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF d_played = 0 AND d_commission = 0 AND d_pending = 0 AND d_paid = 0 THEN
    RETURN;
  END IF;
  UPDATE public.business_totals_shards
     SET played              = played + d_played,
         commission          = commission + d_commission,
         pending_to_trainers = pending_to_trainers + d_pending,
         paid_to_trainers    = paid_to_trainers + d_paid
   WHERE slot = public.bt_slot();
END;
$$;

CREATE OR REPLACE FUNCTION public.bt_trainer_ledger_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p bigint := 0; c bigint := 0; d bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    d := d + NEW.amount;
    IF NEW.kind = 'CLASS_CREDIT' THEN p := p + NEW.amount + NEW.commission; c := c + NEW.commission; END IF;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    d := d - OLD.amount;
    IF OLD.kind = 'CLASS_CREDIT' THEN p := p - OLD.amount - OLD.commission; c := c - OLD.commission; END IF;
  END IF;
  PERFORM public.bt_apply_trainer(p, c, d, 0);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bt_trainer_settlements_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN a := a + NEW.amount; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN a := a - OLD.amount; END IF;
  PERFORM public.bt_apply_trainer(0, 0, 0, a);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bt_trainer_ledger ON public.trainer_ledger;
CREATE TRIGGER bt_trainer_ledger AFTER INSERT OR UPDATE OR DELETE ON public.trainer_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bt_trainer_ledger_trg();
DROP TRIGGER IF EXISTS bt_trainer_settlements ON public.trainer_settlements;
CREATE TRIGGER bt_trainer_settlements AFTER INSERT OR UPDATE OR DELETE ON public.trainer_settlements
  FOR EACH ROW EXECUTE FUNCTION public.bt_trainer_settlements_trg();
DROP TRIGGER IF EXISTS bt_truncate ON public.trainer_ledger;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.trainer_ledger      FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();
DROP TRIGGER IF EXISTS bt_truncate ON public.trainer_settlements;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.trainer_settlements FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();

-- Verificación (057) con lo de entrenadores: "jugado" y "comisión" suman canchas + clases
CREATE OR REPLACE FUNCTION public.business_totals_verify()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_drift jsonb;
BEGIN
  SELECT
    (SELECT coalesce(sum(amount), 0) FROM public.wallet_transactions WHERE kind IN ('TOPUP', 'ADJUSTMENT'))
      - (SELECT sum(collected) FROM public.business_totals_shards)                                AS collected,
    (SELECT coalesce(-sum(amount), 0) FROM public.wallet_transactions WHERE kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND'))
      - (SELECT sum(spent_net) FROM public.business_totals_shards)                                AS spent_net,
    (SELECT coalesce(sum(balance), 0) FROM public.wallets)
      - (SELECT sum(in_wallets) FROM public.business_totals_shards)                               AS in_wallets,
    (SELECT coalesce(sum(amount + commission) FILTER (WHERE kind = 'BOOKING_CREDIT'), 0) FROM public.venue_ledger)
      + (SELECT coalesce(sum(amount + commission) FILTER (WHERE kind = 'CLASS_CREDIT'), 0) FROM public.trainer_ledger)
      - (SELECT sum(played) FROM public.business_totals_shards)                                   AS played,
    (SELECT coalesce(sum(commission) FILTER (WHERE kind = 'BOOKING_CREDIT'), 0) FROM public.venue_ledger)
      + (SELECT coalesce(sum(commission) FILTER (WHERE kind = 'CLASS_CREDIT'), 0) FROM public.trainer_ledger)
      - (SELECT sum(commission) FROM public.business_totals_shards)                               AS commission,
    (SELECT coalesce(sum(amount), 0) FROM public.venue_ledger)
      - (SELECT sum(pending_to_venues) FROM public.business_totals_shards)                        AS pending_to_venues,
    (SELECT coalesce(sum(amount), 0) FROM public.venue_settlements)
      - (SELECT sum(paid_to_venues) FROM public.business_totals_shards)                           AS paid_to_venues,
    (SELECT coalesce(sum(amount), 0) FROM public.trainer_ledger)
      - (SELECT sum(pending_to_trainers) FROM public.business_totals_shards)                      AS pending_to_trainers,
    (SELECT coalesce(sum(amount), 0) FROM public.trainer_settlements)
      - (SELECT sum(paid_to_trainers) FROM public.business_totals_shards)                         AS paid_to_trainers
  INTO r;

  v_drift := to_jsonb(r);
  IF r.collected = 0 AND r.spent_net = 0 AND r.in_wallets = 0 AND r.played = 0 AND r.commission = 0
     AND r.pending_to_venues = 0 AND r.paid_to_venues = 0 AND r.pending_to_trainers = 0 AND r.paid_to_trainers = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.business_totals_shards
     SET collected           = collected           + r.collected,
         spent_net           = spent_net           + r.spent_net,
         in_wallets          = in_wallets          + r.in_wallets,
         played              = played              + r.played,
         commission          = commission          + r.commission,
         pending_to_venues   = pending_to_venues   + r.pending_to_venues,
         paid_to_venues      = paid_to_venues      + r.paid_to_venues,
         pending_to_trainers = pending_to_trainers + r.pending_to_trainers,
         paid_to_trainers    = paid_to_trainers    + r.paid_to_trainers
   WHERE slot = 0;
  INSERT INTO public.business_totals_audit(drift) VALUES (v_drift);
  RETURN jsonb_build_object('ok', false, 'corrected', v_drift);
END;
$$;

-- Tarjetas de Balances (057) + entrenadores
CREATE OR REPLACE FUNCTION public.admin_balances_summary()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  SELECT sum(collected) AS collected, sum(spent_net) AS spent_net, sum(in_wallets) AS in_wallets,
         sum(played) AS played, sum(commission) AS commission,
         sum(pending_to_venues) AS pending_to_venues, sum(paid_to_venues) AS paid_to_venues,
         sum(pending_to_trainers) AS pending_to_trainers, sum(paid_to_trainers) AS paid_to_trainers
    INTO t
    FROM public.business_totals_shards;
  RETURN json_build_object(
    'collected',           t.collected,
    'inWallets',           t.in_wallets,
    'spentPlayed',         t.played,
    'spentNotPlayed',      t.spent_net - t.played,
    'commission',          t.commission,
    'paidToVenues',        t.paid_to_venues,
    'pendingToVenues',     t.pending_to_venues,
    'requestedByVenues',   coalesce((SELECT sum(amount) FROM public.venue_payout_requests WHERE status = 'PENDING'), 0),
    'paidToTrainers',      t.paid_to_trainers,
    'pendingToTrainers',   t.pending_to_trainers,
    'requestedByTrainers', coalesce((SELECT sum(amount) FROM public.trainer_payout_requests WHERE status = 'PENDING'), 0),
    'balanced',            t.collected = t.in_wallets + t.spent_net
  );
END;
$$;

-- Indicador de la pestaña: solicitudes pendientes de complejos + entrenadores
CREATE OR REPLACE FUNCTION public.admin_payout_pending_count()
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (SELECT count(*)::int FROM public.venue_payout_requests WHERE status = 'PENDING')
       + (SELECT count(*)::int FROM public.trainer_payout_requests WHERE status = 'PENDING');
END;
$$;

-- ------------------------------------------------------------
-- 5. Billetera y pagos del entrenador (paralelo a 045/056)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trainer_balance_info(p_trainer uuid, OUT balance bigint, OUT reserved bigint, OUT available bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.b, x.r, x.b - x.r FROM (
    SELECT coalesce((SELECT sum(amount) FROM public.trainer_ledger WHERE trainer_id = p_trainer), 0)::bigint AS b,
           coalesce((SELECT sum(amount) FROM public.trainer_payout_requests
                      WHERE trainer_id = p_trainer AND status = 'PENDING'), 0)::bigint AS r
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.lock_trainer_payouts(p_trainer uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('trainer-payout:' || p_trainer::text, 0));
$$;

-- El entrenador solicita su pago: todo lo disponible (p_amount NULL) o un monto (Req. 10.4)
CREATE OR REPLACE FUNCTION public.request_trainer_payout(p_amount bigint DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := public.require_trainer();
  v_info   record;
  v_amount bigint;
  v_id     uuid;
BEGIN
  PERFORM public.lock_trainer_payouts(v_me);
  IF EXISTS (SELECT 1 FROM public.trainer_payout_requests WHERE trainer_id = v_me AND status = 'PENDING') THEN
    RAISE EXCEPTION 'Ya tenés una solicitud de pago pendiente. Cuando se pague o se rechace, podés pedir otra.'
      USING ERRCODE = 'WL004';
  END IF;
  SELECT * INTO v_info FROM public.trainer_balance_info(v_me);
  IF v_info.available <= 0 THEN
    RAISE EXCEPTION 'No tenés saldo disponible para cobrar' USING ERRCODE = 'WL004';
  END IF;
  v_amount := coalesce(p_amount, v_info.available);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto tiene que ser mayor que 0' USING ERRCODE = 'WL006';
  END IF;
  IF v_amount > v_info.available THEN
    RAISE EXCEPTION 'Podés solicitar hasta % créditos', public.fmt_points(v_info.available) USING ERRCODE = 'WL006';
  END IF;
  INSERT INTO public.trainer_payout_requests (trainer_id, amount) VALUES (v_me, v_amount) RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'amount', v_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_trainer_payout(p_request uuid, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.trainer_payout_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede rechazar solicitudes de pago' USING ERRCODE = 'WL003';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo del rechazo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;
  SELECT * INTO r FROM public.trainer_payout_requests WHERE id = p_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'WL005';
  END IF;
  PERFORM public.lock_trainer_payouts(r.trainer_id);
  SELECT * INTO r FROM public.trainer_payout_requests WHERE id = p_request FOR UPDATE;
  IF r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esa solicitud ya fue resuelta' USING ERRCODE = 'WL004';
  END IF;
  UPDATE public.trainer_payout_requests
     SET status = 'REJECTED', reject_reason = btrim(p_reason), resolved_by = auth.uid(), resolved_at = now()
   WHERE id = r.id;
  RETURN json_build_object('id', r.id, 'rejected', true);
END;
$$;

-- El admin general paga a un entrenador: una solicitud (monto fijo) o por su cuenta (p_amount NULL = todo)
CREATE OR REPLACE FUNCTION public.pay_trainer(
  p_trainer uuid, p_amount bigint, p_request uuid, p_transfer_ref text, p_receipt_path text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref    text := NULLIF(btrim(p_transfer_ref), '');
  v_path   text := NULLIF(btrim(p_receipt_path), '');
  v_info   record;
  v_amount bigint;
  v_id     uuid;
  r        public.trainer_payout_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede registrar pagos a entrenadores' USING ERRCODE = 'WL003';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainers WHERE user_id = p_trainer) THEN
    RAISE EXCEPTION 'Entrenador no encontrado' USING ERRCODE = 'WL005';
  END IF;
  IF v_ref IS NULL AND v_path IS NULL THEN
    RAISE EXCEPTION 'Cargá el número de transferencia o el comprobante' USING ERRCODE = 'WL006';
  END IF;
  IF v_path IS NOT NULL AND (split_part(v_path, '/', 1) <> 'trainers' OR split_part(v_path, '/', 2) <> p_trainer::text) THEN
    RAISE EXCEPTION 'El comprobante no corresponde a este entrenador' USING ERRCODE = 'WL006';
  END IF;

  PERFORM public.lock_trainer_payouts(p_trainer);
  SELECT * INTO v_info FROM public.trainer_balance_info(p_trainer);
  IF p_request IS NOT NULL THEN
    SELECT * INTO r FROM public.trainer_payout_requests WHERE id = p_request FOR UPDATE;
    IF NOT FOUND OR r.trainer_id <> p_trainer THEN
      RAISE EXCEPTION 'Solicitud no encontrada para este entrenador' USING ERRCODE = 'WL005';
    END IF;
    IF r.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Esa solicitud ya fue resuelta' USING ERRCODE = 'WL004';
    END IF;
    v_amount := r.amount;
    IF v_amount > v_info.balance THEN
      RAISE EXCEPTION 'El entrenador ya no tiene ese saldo' USING ERRCODE = 'WL004';
    END IF;
  ELSE
    IF v_info.available <= 0 THEN
      RAISE EXCEPTION 'El entrenador no tiene saldo disponible para pagar%',
        CASE WHEN v_info.reserved > 0 THEN ' (lo que tiene ya está en una solicitud pendiente)' ELSE '' END
        USING ERRCODE = 'WL004';
    END IF;
    v_amount := coalesce(p_amount, v_info.available);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'El monto tiene que ser mayor que 0' USING ERRCODE = 'WL006';
    END IF;
    IF v_amount > v_info.available THEN
      RAISE EXCEPTION 'Podés pagar hasta % créditos', public.fmt_points(v_info.available) USING ERRCODE = 'WL006';
    END IF;
  END IF;

  INSERT INTO public.trainer_settlements (trainer_id, amount, transfer_ref, receipt_path, created_by)
  VALUES (p_trainer, v_amount, v_ref, v_path, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.trainer_ledger (trainer_id, kind, amount, settlement_id, detail)
  VALUES (p_trainer, 'SETTLEMENT', -v_amount, v_id,
          CASE WHEN p_request IS NOT NULL THEN 'Pago de la empresa (solicitado)' ELSE 'Pago de la empresa' END);
  IF p_request IS NOT NULL THEN
    UPDATE public.trainer_payout_requests
       SET status = 'PAID', settlement_id = v_id, resolved_by = auth.uid(), resolved_at = now()
     WHERE id = p_request;
  END IF;
  RETURN json_build_object('settlement_id', v_id, 'amount', v_amount);
END;
$$;

-- Billetera del entrenador (Req. 10.3): el entrenador ve la suya sin comisión; el admin general, cualquiera
CREATE OR REPLACE FUNCTION public.trainer_wallet(
  p_trainer uuid DEFAULT NULL, p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_kind text DEFAULT 'ALL',
  p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin   boolean := public.is_admin();
  v_trainer uuid;
  v_from    timestamptz := public.ar_day_start(p_from);
  v_to      timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_size    int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page    int := greatest(coalesce(p_page, 1), 1);
  v_info    record;
BEGIN
  IF v_admin THEN
    v_trainer := p_trainer;
  ELSIF public.get_my_role() = 'TRAINER' AND (p_trainer IS NULL OR p_trainer = auth.uid()) THEN
    v_trainer := auth.uid();
  END IF;
  IF v_trainer IS NULL OR NOT EXISTS (SELECT 1 FROM public.trainers WHERE user_id = v_trainer) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  SELECT * INTO v_info FROM public.trainer_balance_info(v_trainer);
  RETURN (
    WITH f AS (
      SELECT l.* FROM public.trainer_ledger l
       WHERE l.trainer_id = v_trainer
         AND (v_from IS NULL OR l.created_at >= v_from)
         AND (v_to   IS NULL OR l.created_at <  v_to)
         AND (coalesce(p_kind, 'ALL') = 'ALL' OR l.kind::text = p_kind)
    )
    SELECT json_build_object(
      'trainerId', v_trainer,
      'pending',   v_info.balance,
      'reserved',  v_info.reserved,
      'available', v_info.available,
      'thisMonth', coalesce((SELECT sum(amount) FROM public.trainer_ledger
                              WHERE trainer_id = v_trainer AND kind = 'CLASS_CREDIT'
                                AND public.ar_month(created_at) = public.ar_month(now())), 0),
      'pendingRequest', (SELECT json_build_object('id', q.id, 'amount', q.amount, 'requestedAt', q.requested_at)
                           FROM public.trainer_payout_requests q WHERE q.trainer_id = v_trainer AND q.status = 'PENDING'),
      'requests', coalesce((
        SELECT json_agg(json_build_object('id', q.id, 'amount', q.amount, 'status', q.status, 'requestedAt', q.requested_at,
                                          'resolvedAt', q.resolved_at, 'rejectReason', q.reject_reason) ORDER BY q.requested_at DESC)
          FROM (SELECT * FROM public.trainer_payout_requests WHERE trainer_id = v_trainer ORDER BY requested_at DESC LIMIT 10) q
      ), '[]'::json),
      'total',  (SELECT count(*) FROM f),
      'sumIn',  coalesce((SELECT sum(amount) FILTER (WHERE amount > 0) FROM f), 0),
      'sumOut', coalesce((SELECT -sum(amount) FILTER (WHERE amount < 0) FROM f), 0),
      'sumNet', coalesce((SELECT sum(amount) FROM f), 0),
      'items',  coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'kind', x.kind, 'amount', x.amount, 'detail', x.detail, 'createdAt', x.created_at,
                 'commission', CASE WHEN v_admin THEN x.commission END,
                 'transferRef', s.transfer_ref, 'receiptPath', s.receipt_path) ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC, id LIMIT v_size OFFSET (v_page - 1) * v_size) x
          LEFT JOIN public.trainer_settlements s ON s.id = x.settlement_id
      ), '[]'::json)
    )
  );
END;
$$;

-- Admin general: saldo por entrenador, los que más hay que pagar primero
CREATE OR REPLACE FUNCTION public.admin_trainer_balances(p_trainer uuid DEFAULT NULL, p_page int DEFAULT 1, p_size int DEFAULT 20)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH l AS (
      SELECT trainer_id, sum(amount)::bigint AS balance,
             coalesce(sum(amount) FILTER (WHERE kind = 'CLASS_CREDIT'), 0)::bigint AS earned,
             coalesce(sum(commission), 0)::bigint AS commission
        FROM public.trainer_ledger WHERE p_trainer IS NULL OR trainer_id = p_trainer GROUP BY trainer_id
    ), r AS (
      SELECT trainer_id, sum(amount)::bigint AS reserved FROM public.trainer_payout_requests
       WHERE status = 'PENDING' AND (p_trainer IS NULL OR trainer_id = p_trainer) GROUP BY trainer_id
    ), b AS (
      SELECT l.trainer_id, public.person_name(l.trainer_id) AS trainer_name, l.balance, l.earned, l.commission,
             coalesce(r.reserved, 0) AS reserved, l.balance - coalesce(r.reserved, 0) AS available
        FROM l LEFT JOIN r ON r.trainer_id = l.trainer_id
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM b),
      'totals', (SELECT json_build_object('balance', coalesce(sum(balance), 0), 'reserved', coalesce(sum(reserved), 0),
                                          'available', coalesce(sum(available), 0), 'commission', coalesce(sum(commission), 0)) FROM b),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'trainerId', x.trainer_id, 'trainerName', x.trainer_name, 'balance', x.balance, 'reserved', x.reserved,
                 'available', x.available, 'earned', x.earned, 'commission', x.commission,
                 'lastPaidAt', (SELECT max(s.created_at) FROM public.trainer_settlements s WHERE s.trainer_id = x.trainer_id))
               ORDER BY x.available DESC, x.trainer_name)
          FROM (SELECT * FROM b ORDER BY available DESC, trainer_name, trainer_id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trainer_payout_requests(p_trainer uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN coalesce((
    SELECT json_agg(json_build_object('id', q.id, 'trainerId', q.trainer_id, 'trainerName', public.person_name(q.trainer_id),
                                      'amount', q.amount, 'requestedAt', q.requested_at) ORDER BY q.requested_at)
      FROM public.trainer_payout_requests q
     WHERE q.status = 'PENDING' AND (p_trainer IS NULL OR q.trainer_id = p_trainer)
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trainer_payments(
  p_trainer uuid DEFAULT NULL, p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_search text DEFAULT NULL,
  p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from   timestamptz := public.ar_day_start(p_from);
  v_to     timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_size   int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page   int := greatest(coalesce(p_page, 1), 1);
  v_search text := nullif(btrim(left(coalesce(p_search, ''), 120)), '');
  v_like   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  IF v_search IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  RETURN (
    WITH f AS (
      SELECT s.* FROM public.trainer_settlements s
       WHERE (p_trainer IS NULL OR s.trainer_id = p_trainer)
         AND (v_from IS NULL OR s.created_at >= v_from)
         AND (v_to   IS NULL OR s.created_at <  v_to)
         AND (v_like IS NULL OR s.transfer_ref ILIKE v_like)
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'sumAmount', coalesce((SELECT sum(amount) FROM f), 0),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'trainerId', x.trainer_id, 'trainerName', public.person_name(x.trainer_id), 'amount', x.amount,
                 'paidAt', x.created_at, 'transferRef', x.transfer_ref, 'receiptPath', x.receipt_path,
                 'requested', EXISTS (SELECT 1 FROM public.trainer_payout_requests q WHERE q.settlement_id = x.id))
               ORDER BY x.created_at DESC, x.id)
          FROM (SELECT * FROM f ORDER BY created_at DESC, id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. Recordatorios (Req. 12.1–12.2): reclama los pendientes de una vez (idempotente, como canchas)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_class_reminders()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_students json;
  v_classes  json;
BEGIN
  WITH s AS (
    UPDATE public.class_bookings cb SET reminder_sent_at = now(), updated_at = now()
      FROM public.trainer_classes c
     WHERE c.id = cb.class_id AND cb.status = 'CONFIRMED' AND cb.payment_status = 'PAID' AND cb.reminder_sent_at IS NULL
       AND c.start_datetime > now() AND c.start_datetime <= now() + interval '2 hours'
    RETURNING cb.id, cb.class_id
  )
  SELECT coalesce(json_agg(json_build_object('id', id, 'classId', class_id)), '[]'::json) INTO v_students FROM s;

  WITH k AS (
    UPDATE public.trainer_classes c SET reminder_sent_at = now(), updated_at = now()
     WHERE c.status = 'OPEN' AND c.reminder_sent_at IS NULL
       AND c.start_datetime > now() AND c.start_datetime <= now() + interval '2 hours'
       AND EXISTS (SELECT 1 FROM public.class_bookings cb WHERE cb.class_id = c.id AND cb.status = 'CONFIRMED' AND cb.payment_status = 'PAID')
    RETURNING c.id, c.trainer_id, c.start_datetime, c.sport_id
  ), n AS (
    -- Aviso in-app al entrenador (solo él)
    INSERT INTO public.notifications (type, title, body, venue_id, admin_only, trainer_id, trainer_only, data)
    SELECT 'CLASS_REMINDER', 'Tu próxima clase', sp.name || ' el ' || public.fmt_ar_datetime(k.start_datetime) || '.',
           NULL, false, k.trainer_id, true, jsonb_build_object('classId', k.id)
      FROM k JOIN public.sports sp ON sp.id = k.sport_id
    RETURNING 1
  )
  SELECT coalesce(json_agg(k.id), '[]'::json) INTO v_classes FROM k, (SELECT count(*) FROM n) nn;
  RETURN json_build_object('students', v_students, 'classes', v_classes);
END;
$$;

-- ------------------------------------------------------------
-- 7. Estadísticas (Req. 11.4): mismas reglas AR que get_stats (038)
--    Actividad por día de INICIO; dinero por día de FIN, pagado y terminado.
--    Reservas = Realizadas + Completadas + Canceladas (las que se pagaron).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trainer_stats(
  p_range text DEFAULT 'month', p_from text DEFAULT NULL, p_to text DEFAULT NULL,
  p_trainer uuid DEFAULT NULL, p_sport uuid DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin   boolean := public.is_admin();
  v_trainer uuid;
  v_today   text := to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD');
  v_start   timestamptz;
  v_end     timestamptz;
BEGIN
  IF v_admin THEN
    v_trainer := p_trainer;
  ELSIF public.get_my_role() = 'TRAINER' THEN
    v_trainer := auth.uid();
  ELSE
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  CASE coalesce(p_range, 'month')
    WHEN 'today'     THEN v_start := public.ar_midnight_utc(v_today); v_end := v_start + interval '1 day';
    WHEN 'yesterday' THEN v_start := public.ar_midnight_utc(v_today) - interval '1 day'; v_end := public.ar_midnight_utc(v_today);
    WHEN 'week'      THEN v_start := public.ar_midnight_utc(v_today) - interval '6 days'; v_end := public.ar_midnight_utc(v_today) + interval '1 day';
    WHEN 'custom'    THEN
      IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'Elegí las fechas del período' USING ERRCODE = 'TR002';
      END IF;
      v_start := public.ar_midnight_utc(p_from); v_end := public.ar_midnight_utc(p_to) + interval '1 day';
    WHEN 'all'       THEN v_start := NULL; v_end := NULL;
    ELSE                  v_start := public.ar_midnight_utc(v_today) - interval '29 days'; v_end := public.ar_midnight_utc(v_today) + interval '1 day';
  END CASE;

  RETURN (
    WITH b AS (
      SELECT cb.id, cb.user_id, cb.status, cb.payment_status, cb.paid_at, cb.cancelled_by_role,
             cb.base_price, cb.commission_amount, cb.total_price,
             c.trainer_id, c.sport_id, c.start_datetime, c.end_datetime
        FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
       WHERE (v_trainer IS NULL OR c.trainer_id = v_trainer)
         AND (p_sport IS NULL OR c.sport_id = p_sport)
         AND cb.paid_at IS NOT NULL   -- reservas hechas (las fechas nunca pagadas no cuentan)
    ), act AS (   -- actividad: por día de inicio
      SELECT * FROM b WHERE (v_start IS NULL OR (start_datetime >= v_start AND start_datetime < v_end))
    ), earned AS (   -- dinero: pagada, no cancelada, terminada, por día de fin
      SELECT * FROM b
       WHERE status <> 'CANCELLED' AND end_datetime <= now()
         AND (v_start IS NULL OR (end_datetime > v_start AND end_datetime <= v_end))
    )
    SELECT json_build_object(
      'totals', json_build_object(
        'realizadas',  (SELECT count(*) FROM act WHERE status = 'CONFIRMED' AND end_datetime > now()),
        'completadas', (SELECT count(*) FROM act WHERE status = 'COMPLETED' OR (status = 'CONFIRMED' AND end_datetime <= now())),
        'canceladas',  (SELECT count(*) FROM act WHERE status = 'CANCELLED'),
        'total',       (SELECT count(*) FROM act),
        'cancelledByTrainer', (SELECT count(*) FROM act WHERE status = 'CANCELLED' AND cancelled_by_role = 'TRAINER'),
        'cancelledByClients', (SELECT count(*) FROM act WHERE status = 'CANCELLED' AND cancelled_by_role = 'CLIENT'),
        'uniqueStudents', (SELECT count(DISTINCT user_id) FROM act WHERE status <> 'CANCELLED'),
        'earned',     (SELECT coalesce(sum(base_price), 0) FROM earned),
        'commission', CASE WHEN v_admin THEN (SELECT coalesce(sum(commission_amount), 0) FROM earned) END,
        'revenue',    CASE WHEN v_admin THEN (SELECT coalesce(sum(total_price), 0) FROM earned) END),
      'bySport', coalesce((
        SELECT json_agg(json_build_object('sportId', x.sport_id, 'name', sp.name, 'count', x.n, 'earned', x.earned) ORDER BY x.n DESC)
          FROM (SELECT coalesce(a.sport_id, e.sport_id) AS sport_id, coalesce(a.n, 0) AS n, coalesce(e.earned, 0) AS earned
                  FROM (SELECT sport_id, count(*) AS n FROM act WHERE status <> 'CANCELLED' GROUP BY sport_id) a
                  FULL JOIN (SELECT sport_id, sum(base_price) AS earned FROM earned GROUP BY sport_id) e ON e.sport_id = a.sport_id) x
          JOIN public.sports sp ON sp.id = x.sport_id
      ), '[]'::json),
      'byTrainer', CASE WHEN v_admin THEN coalesce((
        SELECT json_agg(json_build_object('trainerId', x.trainer_id, 'name', public.person_name(x.trainer_id), 'count', x.n,
                                          'earned', x.earned, 'commission', x.commission, 'cancelledByTrainer', x.ct)
                        ORDER BY x.earned DESC, x.n DESC)
          FROM (SELECT coalesce(a.trainer_id, e.trainer_id) AS trainer_id, coalesce(a.n, 0) AS n, coalesce(a.ct, 0) AS ct,
                       coalesce(e.earned, 0) AS earned, coalesce(e.commission, 0) AS commission
                  FROM (SELECT trainer_id, count(*) FILTER (WHERE status <> 'CANCELLED') AS n,
                               count(*) FILTER (WHERE status = 'CANCELLED' AND cancelled_by_role = 'TRAINER') AS ct
                          FROM act GROUP BY trainer_id) a
                  FULL JOIN (SELECT trainer_id, sum(base_price) AS earned, sum(commission_amount) AS commission
                               FROM earned GROUP BY trainer_id) e ON e.trainer_id = a.trainer_id) x
      ), '[]'::json) END,
      'byDay', coalesce((
        SELECT json_agg(json_build_object('date', d, 'earned', s) ORDER BY d)
          FROM (SELECT to_char((end_datetime - interval '1 microsecond') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS d,
                       sum(base_price) AS s
                  FROM earned GROUP BY 1) z
      ), '[]'::json)
    )
  );
END;
$$;

-- Estadísticas del cliente (062) + sus clases, con las mismas reglas de negocio
CREATE OR REPLACE FUNCTION public.my_booking_stats()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT
      count(*) FILTER (WHERE status = 'CONFIRMED' AND payment_status = 'PAID' AND end_datetime > now())    AS realizadas,
      count(*) FILTER (WHERE status = 'COMPLETED'
                          OR (status = 'CONFIRMED' AND payment_status = 'PAID' AND end_datetime <= now())) AS completadas,
      count(*) FILTER (WHERE status = 'CANCELLED' AND paid_at IS NOT NULL)                                 AS canceladas
    FROM public.bookings
    WHERE user_id = auth.uid()
  ), k AS (
    SELECT
      count(*) FILTER (WHERE cb.status = 'CONFIRMED' AND cb.payment_status = 'PAID' AND c.end_datetime > now())    AS realizadas,
      count(*) FILTER (WHERE cb.status = 'COMPLETED'
                          OR (cb.status = 'CONFIRMED' AND cb.payment_status = 'PAID' AND c.end_datetime <= now())) AS completadas,
      count(*) FILTER (WHERE cb.status = 'CANCELLED' AND cb.paid_at IS NOT NULL)                                   AS canceladas
    FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
    WHERE cb.user_id = auth.uid()
  )
  SELECT json_build_object(
    'total',       s.realizadas + s.completadas + s.canceladas,
    'realizadas',  s.realizadas,
    'completadas', s.completadas,
    'canceladas',  s.canceladas,
    'classes', json_build_object(
      'total', k.realizadas + k.completadas + k.canceladas,
      'realizadas', k.realizadas, 'completadas', k.completadas, 'canceladas', k.canceladas)
  )
  FROM s, k;
$$;

-- ------------------------------------------------------------
-- 8. Permisos
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.emit_trainer_notification(public.notification_type, text, text, text, uuid, boolean, boolean, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.person_name(uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_trainer_published()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_class_booked()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_class_cancelled()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_trainer_payout_request()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_trainer_paid()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_trainer_on_complete()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_past_classes()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bt_apply_trainer(bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bt_trainer_ledger_trg()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bt_trainer_settlements_trg()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_totals_verify()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trainer_balance_info(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_trainer_payouts(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_class_reminders()                   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_class_reminders()                TO service_role;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'admin_balances_summary()',
    'admin_payout_pending_count()',
    'request_trainer_payout(bigint)',
    'reject_trainer_payout(uuid, text)',
    'pay_trainer(uuid, bigint, uuid, text, text)',
    'trainer_wallet(uuid, text, text, text, int, int)',
    'admin_trainer_balances(uuid, int, int)',
    'admin_trainer_payout_requests(uuid)',
    'admin_trainer_payments(uuid, text, text, text, int, int)',
    'get_trainer_stats(text, text, text, uuid, uuid)',
    'my_booking_stats()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

-- Carga de los totales nuevos (las tablas nuevas están vacías: no debería haber diferencia)
SELECT public.business_totals_verify();

NOTIFY pgrst, 'reload schema';
