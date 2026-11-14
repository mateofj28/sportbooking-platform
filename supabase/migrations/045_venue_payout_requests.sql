-- SportBooking — Pagos a complejos a pedido (reemplaza la liquidación mensual de 043)
-- Migración: 045_venue_payout_requests.sql
--
-- Regla nueva (decisión del dueño):
--   * El admin de sede puede SOLICITAR el pago cuando quiera, las veces que quiera, siempre
--     que tenga saldo disponible: todo lo disponible o el monto que elija (mayor que 0).
--   * Una sola solicitud pendiente por complejo a la vez.
--   * El admin general la PAGA (con comprobante) o la RECHAZA con un motivo; si la rechaza,
--     el monto vuelve al disponible.
--   * El admin general también puede pagarle a un complejo sin que lo pida.
--
--   Saldo de la sede     = turnos jugados (+base) − pagos recibidos         (venue_ledger)
--   Reservado            = monto de la solicitud pendiente
--   Disponible           = saldo − reservado
--
-- Al aplicar no había ninguna liquidación registrada: no hay datos que migrar.
-- ============================================================

-- 1. Los pagos ya no son "uno por mes". period queda como el mes en que se pagó.
ALTER TABLE public.venue_settlements DROP CONSTRAINT IF EXISTS venue_settlements_one_per_month;
DROP FUNCTION IF EXISTS public.settle_venue_month(uuid, date, text, text);

-- 2. Solicitudes de pago
DO $$ BEGIN
  CREATE TYPE public.payout_request_status AS ENUM ('PENDING', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.venue_payout_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  amount        bigint NOT NULL CHECK (amount > 0),
  status        public.payout_request_status NOT NULL DEFAULT 'PENDING',
  requested_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  reject_reason text CHECK (reject_reason IS NULL OR char_length(btrim(reject_reason)) BETWEEN 3 AND 300),
  settlement_id uuid REFERENCES public.venue_settlements(id) ON DELETE RESTRICT,
  CONSTRAINT payout_request_shape CHECK (
       (status = 'PENDING'  AND resolved_at IS NULL     AND settlement_id IS NULL     AND reject_reason IS NULL)
    OR (status = 'PAID'     AND resolved_at IS NOT NULL AND settlement_id IS NOT NULL AND reject_reason IS NULL)
    OR (status = 'REJECTED' AND resolved_at IS NOT NULL AND settlement_id IS NULL     AND reject_reason IS NOT NULL)
  )
);
-- Una sola solicitud pendiente por complejo
CREATE UNIQUE INDEX IF NOT EXISTS payout_one_pending ON public.venue_payout_requests(venue_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_payout_requests_venue ON public.venue_payout_requests(venue_id, requested_at DESC);

ALTER TABLE public.venue_payout_requests ENABLE ROW LEVEL SECURITY;
-- Sin políticas: se lee y escribe solo con las funciones de abajo.

-- 3. Saldo, reservado y disponible de una sede
CREATE OR REPLACE FUNCTION public.venue_balance_info(
  p_venue uuid, OUT balance bigint, OUT reserved bigint, OUT available bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.b, x.r, x.b - x.r FROM (
    SELECT coalesce((SELECT sum(amount) FROM public.venue_ledger WHERE venue_id = p_venue), 0)::bigint AS b,
           coalesce((SELECT sum(amount) FROM public.venue_payout_requests
                      WHERE venue_id = p_venue AND status = 'PENDING'), 0)::bigint AS r
  ) x;
$$;
REVOKE ALL ON FUNCTION public.venue_balance_info(uuid) FROM PUBLIC, anon, authenticated;

-- Serializa todo lo que mueve el saldo de una sede (solicitar / pagar / rechazar)
CREATE OR REPLACE FUNCTION public.lock_venue_payouts(p_venue uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('venue-payout:' || p_venue::text, 0));
$$;
REVOKE ALL ON FUNCTION public.lock_venue_payouts(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Turno jugado: +base a la sede (sin el "mes ya liquidado" de 043, que ya no existe)
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

  SELECT btrim(first_name || ' ' || last_name) INTO v_client FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.venue_ledger (venue_id, kind, amount, commission, period, booking_id, detail)
  VALUES (v_venue, 'BOOKING_CREDIT', v_base, greatest(round(coalesce(NEW.commission_amount, 0))::bigint, 0),
          public.ar_month(NEW.end_datetime - interval '1 microsecond'), NEW.id,
          left('Turno jugado — ' || coalesce(public.booking_label(NEW.id), 'Reserva')
               || coalesce(' · ' || NULLIF(v_client, ''), ''), 300))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. El admin de sede solicita su pago: todo lo disponible (p_amount NULL) o un monto
CREATE OR REPLACE FUNCTION public.request_venue_payout(p_amount bigint DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue  uuid := public.get_my_venue_id();
  v_info   record;
  v_amount bigint;
  v_id     uuid;
BEGIN
  IF public.get_my_role() <> 'VENUE_ADMIN' OR v_venue IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador del complejo puede solicitar el pago' USING ERRCODE = 'WL003';
  END IF;

  PERFORM public.lock_venue_payouts(v_venue);

  IF EXISTS (SELECT 1 FROM public.venue_payout_requests WHERE venue_id = v_venue AND status = 'PENDING') THEN
    RAISE EXCEPTION 'Ya tenés una solicitud de pago pendiente. Cuando se pague o se rechace, podés pedir otra.'
      USING ERRCODE = 'WL004';
  END IF;

  SELECT * INTO v_info FROM public.venue_balance_info(v_venue);
  IF v_info.available <= 0 THEN
    RAISE EXCEPTION 'No tenés saldo disponible para cobrar' USING ERRCODE = 'WL004';
  END IF;

  v_amount := coalesce(p_amount, v_info.available);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto tiene que ser mayor que 0' USING ERRCODE = 'WL006';
  END IF;
  IF v_amount > v_info.available THEN
    RAISE EXCEPTION 'Podés solicitar hasta % puntos', public.fmt_points(v_info.available) USING ERRCODE = 'WL006';
  END IF;

  INSERT INTO public.venue_payout_requests (venue_id, amount, requested_by)
  VALUES (v_venue, v_amount, auth.uid())
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'amount', v_amount);
END;
$$;

-- 6. El admin general rechaza una solicitud (el monto vuelve al disponible)
CREATE OR REPLACE FUNCTION public.reject_venue_payout(p_request uuid, p_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.venue_payout_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede rechazar solicitudes de pago' USING ERRCODE = 'WL003';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo del rechazo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;

  SELECT * INTO r FROM public.venue_payout_requests WHERE id = p_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'WL005';
  END IF;
  PERFORM public.lock_venue_payouts(r.venue_id);
  SELECT * INTO r FROM public.venue_payout_requests WHERE id = p_request FOR UPDATE;
  IF r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Esa solicitud ya fue resuelta' USING ERRCODE = 'WL004';
  END IF;

  UPDATE public.venue_payout_requests
     SET status = 'REJECTED', reject_reason = btrim(p_reason), resolved_by = auth.uid(), resolved_at = now()
   WHERE id = r.id;
  RETURN json_build_object('id', r.id, 'rejected', true);
END;
$$;

-- 7. El admin general paga a una sede: una solicitud (monto fijo) o por su cuenta
--    (p_amount NULL = todo lo disponible). Comprobante obligatorio.
CREATE OR REPLACE FUNCTION public.pay_venue(
  p_venue        uuid,
  p_amount       bigint,
  p_request      uuid,
  p_transfer_ref text,
  p_receipt_path text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref    text := NULLIF(btrim(p_transfer_ref), '');
  v_path   text := NULLIF(btrim(p_receipt_path), '');
  v_info   record;
  v_amount bigint;
  v_id     uuid;
  r        public.venue_payout_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede registrar pagos a complejos' USING ERRCODE = 'WL003';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue) THEN
    RAISE EXCEPTION 'Complejo no encontrado' USING ERRCODE = 'WL005';
  END IF;
  IF v_ref IS NULL AND v_path IS NULL THEN
    RAISE EXCEPTION 'Cargá el número de transferencia o el comprobante' USING ERRCODE = 'WL006';
  END IF;
  IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> p_venue::text THEN
    RAISE EXCEPTION 'El comprobante no corresponde a este complejo' USING ERRCODE = 'WL006';
  END IF;

  PERFORM public.lock_venue_payouts(p_venue);
  SELECT * INTO v_info FROM public.venue_balance_info(p_venue);

  IF p_request IS NOT NULL THEN
    SELECT * INTO r FROM public.venue_payout_requests WHERE id = p_request FOR UPDATE;
    IF NOT FOUND OR r.venue_id <> p_venue THEN
      RAISE EXCEPTION 'Solicitud no encontrada para este complejo' USING ERRCODE = 'WL005';
    END IF;
    IF r.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Esa solicitud ya fue resuelta' USING ERRCODE = 'WL004';
    END IF;
    v_amount := r.amount;
    IF v_amount > v_info.balance THEN
      RAISE EXCEPTION 'El complejo ya no tiene ese saldo' USING ERRCODE = 'WL004';
    END IF;
  ELSE
    -- Sin solicitud: no puede tocar lo que el complejo ya pidió (eso se paga desde la solicitud)
    IF v_info.available <= 0 THEN
      RAISE EXCEPTION 'El complejo no tiene saldo disponible para pagar%',
        CASE WHEN v_info.reserved > 0 THEN ' (lo que tiene ya está en una solicitud pendiente)' ELSE '' END
        USING ERRCODE = 'WL004';
    END IF;
    v_amount := coalesce(p_amount, v_info.available);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'El monto tiene que ser mayor que 0' USING ERRCODE = 'WL006';
    END IF;
    IF v_amount > v_info.available THEN
      RAISE EXCEPTION 'Podés pagar hasta % puntos', public.fmt_points(v_info.available) USING ERRCODE = 'WL006';
    END IF;
  END IF;

  INSERT INTO public.venue_settlements (venue_id, period, amount, transfer_ref, receipt_path, created_by)
  VALUES (p_venue, public.ar_month(now()), v_amount, v_ref, v_path, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.venue_ledger (venue_id, kind, amount, period, settlement_id, detail)
  VALUES (p_venue, 'SETTLEMENT', -v_amount, public.ar_month(now()), v_id,
          CASE WHEN p_request IS NOT NULL THEN 'Pago de la empresa (solicitado)' ELSE 'Pago de la empresa' END);

  IF p_request IS NOT NULL THEN
    UPDATE public.venue_payout_requests
       SET status = 'PAID', settlement_id = v_id, resolved_by = auth.uid(), resolved_at = now()
     WHERE id = p_request;
  END IF;

  RETURN json_build_object('settlement_id', v_id, 'amount', v_amount);
END;
$$;

-- 8. Billetera de la sede: + disponible, solicitud pendiente e historial de solicitudes
CREATE OR REPLACE FUNCTION public.venue_wallet(
  p_venue uuid DEFAULT NULL, p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_kind text DEFAULT 'ALL',
  p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := public.get_my_role();
  v_venue uuid;
  v_admin boolean := v_role = 'ADMIN';
  v_from  timestamptz := public.ar_day_start(p_from);
  v_to    timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_size  int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page  int := greatest(coalesce(p_page, 1), 1);
  v_info  record;
BEGIN
  IF v_admin THEN
    v_venue := p_venue;
  ELSIF v_role = 'VENUE_ADMIN' THEN
    v_venue := public.get_my_venue_id();
  END IF;
  IF v_venue IS NULL OR (NOT v_admin AND p_venue IS NOT NULL AND p_venue <> v_venue) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;

  SELECT * INTO v_info FROM public.venue_balance_info(v_venue);

  RETURN (
    WITH f AS (
      SELECT l.* FROM public.venue_ledger l
       WHERE l.venue_id = v_venue
         AND (v_from IS NULL OR l.created_at >= v_from)
         AND (v_to   IS NULL OR l.created_at <  v_to)
         AND (coalesce(p_kind, 'ALL') = 'ALL' OR l.kind::text = p_kind)
    )
    SELECT json_build_object(
      'venueId',   v_venue,
      'pending',   v_info.balance,      -- saldo sin cobrar (nombre de 043, se mantiene)
      'reserved',  v_info.reserved,
      'available', v_info.available,
      'thisMonth', coalesce((SELECT sum(amount) FROM public.venue_ledger
                              WHERE venue_id = v_venue AND kind = 'BOOKING_CREDIT' AND period = public.ar_month(now())), 0),
      'pendingRequest', (SELECT json_build_object('id', q.id, 'amount', q.amount, 'requestedAt', q.requested_at)
                           FROM public.venue_payout_requests q
                          WHERE q.venue_id = v_venue AND q.status = 'PENDING'),
      'requests', coalesce((
        SELECT json_agg(json_build_object(
                 'id', q.id, 'amount', q.amount, 'status', q.status, 'requestedAt', q.requested_at,
                 'resolvedAt', q.resolved_at, 'rejectReason', q.reject_reason) ORDER BY q.requested_at DESC)
          FROM (SELECT * FROM public.venue_payout_requests WHERE venue_id = v_venue
                 ORDER BY requested_at DESC LIMIT 10) q
      ), '[]'::json),
      'total',     (SELECT count(*) FROM f),
      'items',     coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'kind', x.kind, 'amount', x.amount, 'period', x.period,
                 'detail', x.detail, 'createdAt', x.created_at,
                 'commission', CASE WHEN v_admin THEN x.commission END,
                 'transferRef', s.transfer_ref, 'receiptPath', s.receipt_path) ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC LIMIT v_size OFFSET (v_page - 1) * v_size) x
          LEFT JOIN public.venue_settlements s ON s.id = x.settlement_id
      ), '[]'::json)
    )
  );
END;
$$;

-- 9. Historial global: el pago ya no lleva mes
CREATE OR REPLACE FUNCTION public.admin_wallet_history(
  p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_kind text DEFAULT 'ALL',
  p_user uuid DEFAULT NULL, p_venue uuid DEFAULT NULL,
  p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := public.ar_day_start(p_from);
  v_to   timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_kind text := coalesce(p_kind, 'ALL');
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH u AS (
      SELECT t.id, t.kind::text AS kind, t.amount, t.created_at, t.reason,
             CASE WHEN t.kind = 'TOPUP' THEN 'Carga de puntos a ' ELSE 'Ajuste a ' END
               || btrim(p.first_name || ' ' || p.last_name) AS detail,
             t.user_id, NULL::uuid AS venue_id, NULL::text AS transfer_ref, NULL::text AS receipt_path
        FROM public.wallet_transactions t
        JOIN public.profiles p ON p.id = t.user_id
       WHERE t.kind IN ('TOPUP', 'ADJUSTMENT')
      UNION ALL
      SELECT s.id, 'SETTLEMENT', -s.amount, s.created_at, NULL,
             'Pago a complejo ' || v.name,
             NULL, s.venue_id, s.transfer_ref, s.receipt_path
        FROM public.venue_settlements s
        JOIN public.venues v ON v.id = s.venue_id
    ), f AS (
      SELECT * FROM u
       WHERE (v_from IS NULL OR created_at >= v_from)
         AND (v_to   IS NULL OR created_at <  v_to)
         AND (v_kind = 'ALL' OR kind = v_kind)
         AND (p_user  IS NULL OR user_id  = p_user)
         AND (p_venue IS NULL OR venue_id = p_venue)
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'kind', x.kind, 'amount', x.amount, 'detail', x.detail, 'reason', x.reason,
                 'userId', x.user_id, 'venueId', x.venue_id, 'transferRef', x.transfer_ref,
                 'receiptPath', x.receipt_path, 'createdAt', x.created_at) ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- 10. Balances: saldo por complejo, solicitudes pendientes y pagos realizados
CREATE OR REPLACE FUNCTION public.admin_balances()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collected  bigint;
  v_in_wallets bigint;
  v_spent_net  bigint;
  v_played     bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_collected FROM public.wallet_transactions WHERE kind IN ('TOPUP', 'ADJUSTMENT');
  SELECT coalesce(sum(balance), 0) INTO v_in_wallets FROM public.wallets;
  SELECT coalesce(-sum(amount), 0) INTO v_spent_net FROM public.wallet_transactions WHERE kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND');
  SELECT coalesce(sum(amount + commission), 0) INTO v_played FROM public.venue_ledger WHERE kind = 'BOOKING_CREDIT';

  RETURN json_build_object(
    'collected',        v_collected,
    'inWallets',        v_in_wallets,
    'spentPlayed',      v_played,
    'spentNotPlayed',   v_spent_net - v_played,
    'commission',       coalesce((SELECT sum(commission) FROM public.venue_ledger WHERE kind = 'BOOKING_CREDIT'), 0),
    'paidToVenues',     coalesce((SELECT sum(amount) FROM public.venue_settlements), 0),
    'pendingToVenues',  coalesce((SELECT sum(amount) FROM public.venue_ledger), 0),
    'requestedByVenues', coalesce((SELECT sum(amount) FROM public.venue_payout_requests WHERE status = 'PENDING'), 0),
    'balanced',         v_collected = v_in_wallets + v_spent_net,
    -- Saldo por complejo (los que tuvieron movimientos)
    'venues', coalesce((
      SELECT json_agg(json_build_object(
               'venueId', v.id, 'venueName', v.name,
               'balance', i.balance, 'reserved', i.reserved, 'available', i.available,
               'earned', coalesce((SELECT sum(amount) FROM public.venue_ledger l WHERE l.venue_id = v.id AND l.kind = 'BOOKING_CREDIT'), 0),
               'commission', coalesce((SELECT sum(commission) FROM public.venue_ledger l WHERE l.venue_id = v.id), 0),
               'lastPaidAt', (SELECT max(created_at) FROM public.venue_settlements s WHERE s.venue_id = v.id))
             ORDER BY i.available DESC, v.name)
        FROM public.venues v
        CROSS JOIN LATERAL public.venue_balance_info(v.id) i
       WHERE EXISTS (SELECT 1 FROM public.venue_ledger l WHERE l.venue_id = v.id)
    ), '[]'::json),
    -- Solicitudes pendientes (las más viejas primero)
    'requests', coalesce((
      SELECT json_agg(json_build_object(
               'id', q.id, 'venueId', q.venue_id, 'venueName', v.name, 'amount', q.amount,
               'requestedAt', q.requested_at,
               'requestedBy', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
             ORDER BY q.requested_at)
        FROM public.venue_payout_requests q
        JOIN public.venues v ON v.id = q.venue_id
        LEFT JOIN public.profiles p ON p.id = q.requested_by
       WHERE q.status = 'PENDING'
    ), '[]'::json),
    -- Pagos realizados (últimos 50)
    'payments', coalesce((
      SELECT json_agg(json_build_object(
               'id', s.id, 'venueId', s.venue_id, 'venueName', v.name, 'amount', s.amount,
               'paidAt', s.created_at, 'transferRef', s.transfer_ref, 'receiptPath', s.receipt_path,
               'requested', EXISTS (SELECT 1 FROM public.venue_payout_requests q WHERE q.settlement_id = s.id))
             ORDER BY s.created_at DESC)
        FROM (SELECT * FROM public.venue_settlements ORDER BY created_at DESC LIMIT 50) s
        JOIN public.venues v ON v.id = s.venue_id
    ), '[]'::json)
  );
END;
$$;

-- 11. Permisos (validan el rol adentro)
REVOKE ALL ON FUNCTION public.request_venue_payout(bigint)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_venue_payout(uuid, text)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_venue(uuid, bigint, uuid, text, text)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_venue_payout(bigint)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_venue_payout(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_venue(uuid, bigint, uuid, text, text)    TO authenticated;

NOTIFY pgrst, 'reload schema';
