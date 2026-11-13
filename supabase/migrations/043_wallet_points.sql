-- SportBooking — Billetera de puntos (1 punto = 1 ARS)
-- Migración: 043_wallet_points.sql
-- Spec: .kiro/specs/billetera-puntos (requirements.md, design.md)
--
-- Todo movimiento de puntos es una fila inmutable en un libro; el saldo se actualiza en
-- la MISMA transacción con la fila de la billetera bloqueada (FOR UPDATE). La base
-- garantiza: saldo >= 0, una reserva se paga y se devuelve una sola vez, un turno se
-- acredita a la sede una sola vez, y un mes se liquida una sola vez.
--
-- ATENCIÓN: la sección 0 BORRA todas las reservas, turnos fijos, cambios de precio y
-- notificaciones de reservas (decisión D8: arrancar en limpio). Irreversible.
-- ============================================================

-- ============================================================
-- 0. Arranque en limpio (R9, D8)
-- ============================================================
DELETE FROM public.notifications
 WHERE type IN ('BOOKING_CREATED', 'BOOKING_PAID', 'BOOKING_CANCELLED', 'BOOKING_AUTO_CANCELLED',
                'RECURRING_CREATED', 'NEW_CLIENT', 'COMMISSION_EARNED');
DELETE FROM public.booking_price_changes;
DELETE FROM public.bookings;
DELETE FROM public.recurring_bookings;

-- ============================================================
-- 1. Redondeo al peso (D9)
-- ============================================================
UPDATE public.pricing SET price_per_hour = round(price_per_hour) WHERE price_per_hour <> round(price_per_hour);
ALTER TABLE public.pricing DROP CONSTRAINT IF EXISTS pricing_price_whole_pesos;
ALTER TABLE public.pricing
  ADD CONSTRAINT pricing_price_whole_pesos CHECK (price_per_hour = round(price_per_hour));

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_facility_id    uuid,
  p_start_datetime timestamptz
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facility     record;
  v_pricing      record;
  v_dow          int;
  v_start_min    int;
  v_start_ar     timestamp;
  v_start_time   time;
  v_base         numeric;
  v_commission   numeric;
  v_total        numeric;
BEGIN
  SELECT id, is_active INTO v_facility FROM public.facilities WHERE id = p_facility_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancha no encontrada: %', p_facility_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_facility.is_active THEN
    RAISE EXCEPTION 'Cancha no disponible (inactiva)' USING ERRCODE = 'P0003';
  END IF;

  v_start_ar   := p_start_datetime AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_start_time := v_start_ar::time;
  v_dow        := ((EXTRACT(DOW FROM v_start_ar)::int + 6) % 7);
  v_start_min  := EXTRACT(HOUR FROM v_start_ar)::int * 60 + EXTRACT(MINUTE FROM v_start_ar)::int;

  SELECT p.* INTO v_pricing
  FROM public.pricing p
  WHERE p.facility_id = p_facility_id
    AND p.is_active = true
    AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
    AND (
      (p.end_time::time > p.start_time::time AND p.start_time::time <= v_start_time AND v_start_time < p.end_time::time)
      OR
      (p.end_time::time <= p.start_time::time AND (v_start_time >= p.start_time::time OR v_start_time < p.end_time::time))
    )
  ORDER BY p.day_of_week NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin tarifa activa para este horario (día: %, hora: %)', v_dow, v_start_min
      USING ERRCODE = 'P0004';
  END IF;

  -- (043) Puntos enteros: la comisión se redondea al peso
  v_base       := round(v_pricing.price_per_hour);
  v_commission := round(v_base * v_pricing.profit_percent / 100);
  v_total      := v_base + v_commission;

  RETURN json_build_object(
    'base_price',        v_base,
    'commission_amount', v_commission,
    'total_price',       v_total,
    'currency',          v_pricing.currency,
    'pricing_id',        v_pricing.id
  );
END;
$$;

-- ============================================================
-- 2. Tablas
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.wallet_tx_kind AS ENUM ('TOPUP', 'ADJUSTMENT', 'BOOKING_PAYMENT', 'BOOKING_REFUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.venue_ledger_kind AS ENUM ('BOOKING_CREDIT', 'SETTLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: es registro de dinero; un usuario con movimientos se desactiva, no se borra
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind          public.wallet_tx_kind NOT NULL,
  amount        bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  booking_id    uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  detail        text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 300),
  reason        text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_tx_sign CHECK (
       (kind = 'TOPUP'           AND amount > 0)
    OR (kind = 'ADJUSTMENT'      AND amount < 0)
    OR (kind = 'BOOKING_PAYMENT' AND amount < 0)
    OR (kind = 'BOOKING_REFUND'  AND amount > 0)
  ),
  CONSTRAINT wallet_tx_reason CHECK (
    kind NOT IN ('TOPUP', 'ADJUSTMENT') OR char_length(btrim(coalesce(reason, ''))) BETWEEN 3 AND 300
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_one_payment ON public.wallet_transactions(booking_id) WHERE kind = 'BOOKING_PAYMENT';
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_one_refund  ON public.wallet_transactions(booking_id) WHERE kind = 'BOOKING_REFUND';
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created      ON public.wallet_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.venue_settlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  period       date NOT NULL CHECK (period = date_trunc('month', period)::date),
  amount       bigint NOT NULL CHECK (amount > 0),
  transfer_ref text CHECK (transfer_ref IS NULL OR char_length(btrim(transfer_ref)) BETWEEN 1 AND 120),
  receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) BETWEEN 1 AND 300),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_settlements_one_per_month UNIQUE (venue_id, period),
  CONSTRAINT venue_settlements_receipt CHECK (transfer_ref IS NOT NULL OR receipt_path IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.venue_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  kind          public.venue_ledger_kind NOT NULL,
  amount        bigint NOT NULL CHECK (amount <> 0),
  commission    bigint NOT NULL DEFAULT 0 CHECK (commission >= 0),
  period        date NOT NULL CHECK (period = date_trunc('month', period)::date),
  booking_id    uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES public.venue_settlements(id) ON DELETE RESTRICT,
  detail        text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 300),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_ledger_shape CHECK (
       (kind = 'BOOKING_CREDIT' AND amount > 0 AND settlement_id IS NULL)
    OR (kind = 'SETTLEMENT'     AND amount < 0 AND commission = 0 AND settlement_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_ledger_one_credit ON public.venue_ledger(booking_id) WHERE kind = 'BOOKING_CREDIT';
CREATE INDEX IF NOT EXISTS idx_venue_ledger_venue_created ON public.venue_ledger(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_ledger_venue_period  ON public.venue_ledger(venue_id, period);

-- Billetera para cada perfil (alta) + las de los usuarios que ya existen
CREATE OR REPLACE FUNCTION public.create_wallet_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_wallet_for_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_wallet_for_profile ON public.profiles;
CREATE TRIGGER create_wallet_for_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_profile();

INSERT INTO public.wallets (user_id) SELECT id FROM public.profiles ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 3. Permisos: nadie escribe por la API; lectura limitada (R10.1)
-- ============================================================
ALTER TABLE public.wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_settlements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_ledger        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_select_own_or_admin ON public.wallets;
CREATE POLICY wallets_select_own_or_admin ON public.wallets
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS wallet_tx_select_own_or_admin ON public.wallet_transactions;
CREATE POLICY wallet_tx_select_own_or_admin ON public.wallet_transactions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
-- venue_ledger / venue_settlements: sin políticas = sin acceso directo (se leen por RPC,
-- para que la comisión no le llegue al admin de sede).

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ============================================================
-- 4. Bucket privado de comprobantes de liquidación (R8.3, R8.6)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('settlement-receipts', 'settlement-receipts', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "receipts_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "receipts_read"         ON storage.objects;
CREATE POLICY "receipts_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'settlement-receipts' AND public.is_admin());
CREATE POLICY "receipts_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'settlement-receipts' AND (
      public.is_admin()
      OR (public.get_my_role() = 'VENUE_ADMIN'
          AND public.get_my_venue_id() IS NOT NULL
          AND (storage.foldername(name))[1] = public.get_my_venue_id()::text)
    )
  );

-- ============================================================
-- 5. Utilidades
-- ============================================================
-- 63000 -> "63.000"
CREATE OR REPLACE FUNCTION public.fmt_points(p bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(to_char(p, 'FM999,999,999,990'), ',', '.');
$$;

-- "Cancha 1 · Simulación 1 · 14/11 18:00" (hora AR)
CREATE OR REPLACE FUNCTION public.booking_label(p_booking uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.name || ' · ' || v.name || ' · '
         || to_char(b.start_datetime AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
    FROM public.bookings b
    JOIN public.facilities f ON f.id = b.facility_id
    JOIN public.venues v ON v.id = f.venue_id
   WHERE b.id = p_booking;
$$;

-- Primer día del mes AR de un instante
CREATE OR REPLACE FUNCTION public.ar_month(p_ts timestamptz)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', p_ts AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

-- "YYYY-MM-DD" (día AR) -> instante de las 00:00 AR. NULL/vacío -> NULL.
CREATE OR REPLACE FUNCTION public.ar_day_start(p_day text)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_day IS NULL OR btrim(p_day) = '' THEN NULL
              ELSE (p_day::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' END;
$$;

-- ============================================================
-- 6. Movimiento de puntos (núcleo)
-- Códigos de error propios (los traduce _shared/wallet-errors.ts):
--   WL001 saldo insuficiente (402) · WL002 el precio cambió (409) · WL003 no autorizado (403)
--   WL004 estado inválido (409)   · WL005 no encontrado (404)    · WL006 dato inválido (400)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wallet_apply(
  p_user    uuid,
  p_kind    public.wallet_tx_kind,
  p_amount  bigint,
  p_booking uuid,
  p_detail  text,
  p_reason  text,
  p_by      uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
  v_new     bigint;
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;

  v_new := v_balance + p_amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % puntos y tenés %. Te faltan %.',
      public.fmt_points(-p_amount), public.fmt_points(v_balance), public.fmt_points(-v_new)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', -p_amount, 'available', v_balance, 'missing', -v_new)::text;
  END IF;

  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, booking_id, detail, reason, created_by)
  VALUES (p_user, p_kind, p_amount, v_new, p_booking, p_detail, NULLIF(btrim(p_reason), ''), p_by);

  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_user;
  RETURN v_new;
END;
$$;

-- Reserva propia: precio + reserva PAGADA + descuento, en una sola transacción (R2.1–2.4)
CREATE OR REPLACE FUNCTION public.create_booking_paid(
  p_facility uuid,
  p_user     uuid,
  p_start    timestamptz,
  p_end      timestamptz,
  p_notes    text,
  p_by       uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price   json;
  v_total   bigint;
  v_balance bigint;
  v_id      uuid;
BEGIN
  v_price := public.calculate_price(p_facility, p_start);
  v_total := (v_price ->> 'total_price')::numeric::bigint;

  -- Falla rápido si no alcanza (antes de ocupar el horario)
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % puntos y tenés %. Te faltan %.',
      public.fmt_points(v_total), public.fmt_points(v_balance), public.fmt_points(v_total - v_balance)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', v_total, 'available', v_balance, 'missing', v_total - v_balance)::text;
  END IF;

  -- Los triggers de 025 validan horario, bloqueos y superposición
  INSERT INTO public.bookings (
    facility_id, user_id, start_datetime, end_datetime, status, payment_status, paid_at,
    total_price, base_price, commission_amount, currency, notes, created_by
  ) VALUES (
    p_facility, p_user, p_start, p_end, 'CONFIRMED', 'PAID', now(),
    (v_price ->> 'total_price')::numeric, (v_price ->> 'base_price')::numeric,
    (v_price ->> 'commission_amount')::numeric, coalesce(v_price ->> 'currency', 'ARS'),
    NULLIF(btrim(p_notes), ''), p_by
  )
  RETURNING id INTO v_id;

  PERFORM public.wallet_apply(p_user, 'BOOKING_PAYMENT', -v_total, v_id,
    'Reserva — ' || public.booking_label(v_id), NULL, p_by);
  RETURN v_id;
END;
$$;

-- Pagar una reserva pendiente (turno fijo o reserva manual de un admin) (R2.7–2.10)
CREATE OR REPLACE FUNCTION public.pay_booking(
  p_booking  uuid,
  p_user     uuid,
  p_expected numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b       public.bookings%ROWTYPE;
  v_total bigint;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'WL005';
  END IF;
  IF b.user_id IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'Solo el titular de la reserva puede pagarla' USING ERRCODE = 'WL003';
  END IF;
  IF b.payment_status = 'PAID' THEN
    RETURN json_build_object('paid', true, 'already', true, 'total', round(b.total_price)::bigint);
  END IF;
  IF b.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'No se puede pagar una reserva cancelada o finalizada' USING ERRCODE = 'WL004';
  END IF;
  IF b.start_datetime <= now() THEN
    RAISE EXCEPTION 'El turno ya empezó: no se puede pagar' USING ERRCODE = 'WL004';
  END IF;
  IF p_expected IS NOT NULL AND round(p_expected * 100) <> round(b.total_price * 100) THEN
    RAISE EXCEPTION 'El precio de esta fecha cambió a % puntos. Revisalo antes de pagar.',
      public.fmt_points(round(b.total_price)::bigint)
      USING ERRCODE = 'WL002', DETAIL = json_build_object('total', b.total_price)::text;
  END IF;

  v_total := round(b.total_price)::bigint;
  PERFORM public.wallet_apply(p_user, 'BOOKING_PAYMENT', -v_total, b.id,
    'Reserva — ' || public.booking_label(b.id), NULL, p_user);

  UPDATE public.bookings SET payment_status = 'PAID', paid_at = now(), updated_at = now() WHERE id = b.id;
  RETURN json_build_object('paid', true, 'already', false, 'total', v_total);
END;
$$;

-- Cancelar y devolver lo pagado (R3). Permisos y regla de 24 h: en la Edge Function.
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking uuid,
  p_by      uuid,
  p_reason  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b        public.bookings%ROWTYPE;
  v_paid   bigint;
  v_refund bigint := 0;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'WL005';
  END IF;
  IF b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'La reserva ya está cancelada' USING ERRCODE = 'WL004';
  END IF;
  IF b.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada' USING ERRCODE = 'WL004';
  END IF;

  UPDATE public.bookings
     SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = p_by,
         cancellation_reason = NULLIF(btrim(p_reason), ''), updated_at = now()
   WHERE id = b.id;

  -- Devolución del 100% de lo efectivamente pagado (no del precio actual)
  SELECT -amount INTO v_paid FROM public.wallet_transactions
   WHERE booking_id = b.id AND kind = 'BOOKING_PAYMENT';
  IF v_paid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE booking_id = b.id AND kind = 'BOOKING_REFUND') THEN
    PERFORM public.wallet_apply(b.user_id, 'BOOKING_REFUND', v_paid, b.id,
      'Devolución — ' || public.booking_label(b.id), NULL, p_by);
    v_refund := v_paid;
  END IF;

  RETURN json_build_object('cancelled', true, 'refunded', v_refund);
END;
$$;

-- Recarga / ajuste del admin general (R6.3–6.5, D7)
CREATE OR REPLACE FUNCTION public.wallet_admin_adjust(
  p_user   uuid,
  p_amount bigint,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name    text;
  v_balance bigint;
  v_new     bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede cargar o ajustar puntos' USING ERRCODE = 'WL003';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR abs(p_amount) > 100000000 THEN
    RAISE EXCEPTION 'La cantidad de puntos tiene que ser distinta de 0 (máximo 100.000.000)' USING ERRCODE = 'WL006';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;

  SELECT btrim(first_name || ' ' || last_name) INTO v_name FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'WL005';
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'El cliente tiene % puntos: no se pueden restar %', public.fmt_points(v_balance), public.fmt_points(-p_amount)
      USING ERRCODE = 'WL006';
  END IF;

  v_new := public.wallet_apply(
    p_user,
    CASE WHEN p_amount > 0 THEN 'TOPUP' ELSE 'ADJUSTMENT' END::public.wallet_tx_kind,
    p_amount, NULL,
    CASE WHEN p_amount > 0 THEN 'Carga de puntos' ELSE 'Ajuste de puntos' END,
    btrim(p_reason), auth.uid());
  RETURN json_build_object('balance', v_new);
END;
$$;

-- Turno jugado: +precio base a la sede y comisión de la empresa, una sola vez (R4)
CREATE OR REPLACE FUNCTION public.credit_venue_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue  uuid;
  v_period date;
  v_base   bigint;
  v_client text;
BEGIN
  SELECT f.venue_id INTO v_venue FROM public.facilities f WHERE f.id = NEW.facility_id;
  v_base := round(coalesce(NEW.base_price, 0))::bigint;
  IF v_venue IS NULL OR v_base <= 0 THEN
    RETURN NEW;
  END IF;

  -- Mes del día en que terminó el turno (hora AR). Si ese mes ya se liquidó, va al mes
  -- en curso (R8.7). El lock serializa con settle_venue_month del mismo mes.
  v_period := public.ar_month(NEW.end_datetime - interval '1 microsecond');
  PERFORM pg_advisory_xact_lock(hashtextextended('settle:' || v_venue::text || ':' || v_period::text, 0));
  IF EXISTS (SELECT 1 FROM public.venue_settlements WHERE venue_id = v_venue AND period = v_period) THEN
    v_period := public.ar_month(now());
  END IF;

  SELECT btrim(first_name || ' ' || last_name) INTO v_client FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.venue_ledger (venue_id, kind, amount, commission, period, booking_id, detail)
  VALUES (v_venue, 'BOOKING_CREDIT', v_base, greatest(round(coalesce(NEW.commission_amount, 0))::bigint, 0),
          v_period, NEW.id,
          left('Turno jugado — ' || coalesce(public.booking_label(NEW.id), 'Reserva')
               || coalesce(' · ' || NULLIF(v_client, ''), ''), 300))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_venue_on_complete ON public.bookings;
CREATE TRIGGER credit_venue_on_complete
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' AND NEW.payment_status = 'PAID')
  EXECUTE FUNCTION public.credit_venue_on_complete();

-- Liquidación mensual a una sede (R8)
CREATE OR REPLACE FUNCTION public.settle_venue_month(
  p_venue        uuid,
  p_period       date,
  p_transfer_ref text,
  p_receipt_path text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := date_trunc('month', p_period)::date;
  v_ref    text := NULLIF(btrim(p_transfer_ref), '');
  v_path   text := NULLIF(btrim(p_receipt_path), '');
  v_amount bigint;
  v_id     uuid;
  v_name   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede registrar pagos a sedes' USING ERRCODE = 'WL003';
  END IF;
  SELECT name INTO v_name FROM public.venues WHERE id = p_venue;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complejo no encontrado' USING ERRCODE = 'WL005';
  END IF;
  IF v_period IS NULL OR v_period >= public.ar_month(now()) THEN
    RAISE EXCEPTION 'Solo se pueden liquidar meses ya terminados' USING ERRCODE = 'WL006';
  END IF;
  IF v_ref IS NULL AND v_path IS NULL THEN
    RAISE EXCEPTION 'Cargá el número de transferencia o el comprobante' USING ERRCODE = 'WL006';
  END IF;
  IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> p_venue::text THEN
    RAISE EXCEPTION 'El comprobante no corresponde a este complejo' USING ERRCODE = 'WL006';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('settle:' || p_venue::text || ':' || v_period::text, 0));

  IF EXISTS (SELECT 1 FROM public.venue_settlements WHERE venue_id = p_venue AND period = v_period) THEN
    RAISE EXCEPTION 'Ese mes ya está liquidado para este complejo' USING ERRCODE = 'WL004';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_amount
    FROM public.venue_ledger
   WHERE venue_id = p_venue AND period = v_period AND kind = 'BOOKING_CREDIT';
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'No hay nada para liquidar en ese mes' USING ERRCODE = 'WL004';
  END IF;

  INSERT INTO public.venue_settlements (venue_id, period, amount, transfer_ref, receipt_path, created_by)
  VALUES (p_venue, v_period, v_amount, v_ref, v_path, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.venue_ledger (venue_id, kind, amount, period, settlement_id, detail)
  VALUES (p_venue, 'SETTLEMENT', -v_amount, v_period, v_id,
          'Pago de la empresa — ' || to_char(v_period, 'MM/YYYY'));

  RETURN json_build_object('settlement_id', v_id, 'amount', v_amount);
END;
$$;

-- ============================================================
-- 7. Lecturas (paginadas en el servidor)
-- ============================================================
-- Billetera propia (R1)
CREATE OR REPLACE FUNCTION public.my_wallet_history(
  p_from text DEFAULT NULL, p_to text DEFAULT NULL, p_kind text DEFAULT 'ALL',
  p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from timestamptz := public.ar_day_start(p_from);
  v_to   timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH f AS (
      SELECT t.* FROM public.wallet_transactions t
       WHERE t.user_id = v_user
         AND (v_from IS NULL OR t.created_at >= v_from)
         AND (v_to   IS NULL OR t.created_at <  v_to)
         AND (coalesce(p_kind, 'ALL') = 'ALL' OR t.kind::text = p_kind)
    )
    SELECT json_build_object(
      'balance', coalesce((SELECT balance FROM public.wallets WHERE user_id = v_user), 0),
      'total',   (SELECT count(*) FROM f),
      'items',   coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'kind', x.kind, 'amount', x.amount, 'balanceAfter', x.balance_after,
                 'detail', x.detail, 'reason', CASE WHEN x.kind IN ('TOPUP', 'ADJUSTMENT') THEN x.reason END,
                 'bookingId', x.booking_id, 'createdAt', x.created_at) ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- Billetera de la sede (R5). El admin de sede no recibe la comisión.
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
BEGIN
  IF v_admin THEN
    v_venue := p_venue;
  ELSIF v_role = 'VENUE_ADMIN' THEN
    v_venue := public.get_my_venue_id();
  END IF;
  IF v_venue IS NULL OR (NOT v_admin AND p_venue IS NOT NULL AND p_venue <> v_venue) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;

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
      'pending',   coalesce((SELECT sum(amount) FROM public.venue_ledger WHERE venue_id = v_venue), 0),
      'thisMonth', coalesce((SELECT sum(amount) FROM public.venue_ledger
                              WHERE venue_id = v_venue AND kind = 'BOOKING_CREDIT' AND period = public.ar_month(now())), 0),
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

-- Usuarios con saldo y total gastado (R6.2)
CREATE OR REPLACE FUNCTION public.admin_points_users(
  p_search text DEFAULT NULL, p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q      text := NULLIF(lower(btrim(p_search)), '');
  v_digits text := NULLIF(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_size   int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page   int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH f AS (
      SELECT p.id, p.first_name, p.last_name, p.email, p.dni, p.role,
             coalesce(w.balance, 0) AS balance,
             coalesce((SELECT -sum(t.amount) FROM public.wallet_transactions t
                        WHERE t.user_id = p.id AND t.kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND')), 0) AS spent
        FROM public.profiles p
        LEFT JOIN public.wallets w ON w.user_id = p.id
       WHERE v_q IS NULL
          OR lower(p.first_name || ' ' || p.last_name) LIKE '%' || v_q || '%'
          OR lower(coalesce(p.email, '')) LIKE '%' || v_q || '%'
          OR (v_digits IS NOT NULL AND coalesce(p.dni, '') LIKE '%' || v_digits || '%')
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'firstName', x.first_name, 'lastName', x.last_name, 'email', x.email,
                 'dni', x.dni, 'role', x.role, 'balance', x.balance, 'spent', x.spent)
                 ORDER BY x.last_name, x.first_name)
          FROM (SELECT * FROM f ORDER BY last_name, first_name LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- Historial global: recargas, ajustes y pagos a complejos (R6.6)
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
             'Pago a complejo ' || v.name || ' — ' || to_char(s.period, 'MM/YYYY'),
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

-- Balances del negocio (R7) con verificación de cuadre (R7.4)
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
    'collected',         v_collected,                                    -- recargas − ajustes
    'inWallets',         v_in_wallets,                                   -- sin usar
    'spentPlayed',       v_played,                                       -- turnos jugados (base + comisión)
    'spentNotPlayed',    v_spent_net - v_played,                         -- pagados, todavía no jugados
    'commission',        coalesce((SELECT sum(commission) FROM public.venue_ledger WHERE kind = 'BOOKING_CREDIT'), 0),
    'paidToVenues',      coalesce((SELECT sum(amount) FROM public.venue_settlements), 0),
    'pendingToVenues',   coalesce((SELECT sum(amount) FROM public.venue_ledger), 0),
    'balanced',          v_collected = v_in_wallets + v_spent_net,
    'currentMonth',      public.ar_month(now()),
    'months', coalesce((
      SELECT json_agg(json_build_object(
               'venueId', m.venue_id, 'venueName', v.name, 'period', m.period,
               'amount', m.amount, 'commission', m.commission, 'bookings', m.n,
               'settlementId', s.id, 'paidAt', s.created_at, 'paidAmount', s.amount,
               'transferRef', s.transfer_ref, 'receiptPath', s.receipt_path,
               'status', CASE WHEN s.id IS NOT NULL THEN 'PAID'
                              WHEN m.period >= public.ar_month(now()) THEN 'IN_PROGRESS'
                              ELSE 'PENDING' END)
             ORDER BY m.period DESC, v.name)
        FROM (SELECT venue_id, period, sum(amount) AS amount, sum(commission) AS commission, count(*) AS n
                FROM public.venue_ledger WHERE kind = 'BOOKING_CREDIT'
               GROUP BY venue_id, period) m
        JOIN public.venues v ON v.id = m.venue_id
        LEFT JOIN public.venue_settlements s ON s.venue_id = m.venue_id AND s.period = m.period
    ), '[]'::json)
  );
END;
$$;

-- ============================================================
-- 8. Quién puede ejecutar qué
-- ============================================================
REVOKE ALL ON FUNCTION public.wallet_apply(uuid, public.wallet_tx_kind, bigint, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_booking_paid(uuid, uuid, timestamptz, timestamptz, text, uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_booking(uuid, uuid, numeric)                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, uuid, text)                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_venue_on_complete()                                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_label(uuid)                                                     FROM PUBLIC, anon, authenticated;
-- Las Edge Functions (service_role) llaman a las que mueven puntos por reservas
GRANT EXECUTE ON FUNCTION public.create_booking_paid(uuid, uuid, timestamptz, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_booking(uuid, uuid, numeric)                                      TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid, text)                                      TO service_role;

-- Las del panel y las lecturas validan el rol adentro (is_admin / get_my_role)
REVOKE ALL ON FUNCTION public.wallet_admin_adjust(uuid, bigint, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_venue_month(uuid, date, text, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_wallet_history(text, text, text, int, int)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venue_wallet(uuid, text, text, text, int, int)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_points_users(text, int, int)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wallet_history(text, text, text, uuid, uuid, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_balances()                                       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_admin_adjust(uuid, bigint, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_venue_month(uuid, date, text, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_wallet_history(text, text, text, int, int)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_wallet(uuid, text, text, text, int, int)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_points_users(text, int, int)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wallet_history(text, text, text, uuid, uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_balances()                                       TO authenticated;

NOTIFY pgrst, 'reload schema';
