-- ============================================================
-- 057 · Totales del negocio precalculados (tarjetas de Balances)
--
-- Antes, admin_balances_summary() sumaba en cada carga todo el historial de
-- wallet_transactions, wallets, venue_ledger y venue_settlements. Ahora:
--
--   * business_totals_shards guarda las sumas. Triggers en esas 4 tablas aplican el cambio
--     de cada fila en la MISMA transacción, así que los totales nunca quedan a medias.
--   * Son 16 filas ("shards") y cada transacción escribe en una sola, elegida por su id.
--     Con una sola fila, todos los pagos del sistema esperarían turno sobre ese registro;
--     así se reparten. Una transacción toca siempre la misma fila: no hay deadlocks.
--   * La tarjeta lee 16 filas: costo fijo sin importar el tamaño del historial.
--   * business_totals_verify() recalcula todo en una sola consulta (una sola foto de la base)
--     y corrige cualquier diferencia (ej. un cambio hecho con los triggers desactivados).
--     Corre todos los días a las 03:30 AR y deja registro solo si encontró diferencias.
--   * "Solicitado por complejos" sigue en vivo: hay como mucho una solicitud pendiente por
--     complejo (payout_one_pending), es una consulta chica sobre un índice parcial.
-- ============================================================

-- 1. Tabla de totales (no la lee nadie directo: solo funciones SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.business_totals_shards (
  slot              smallint PRIMARY KEY CHECK (slot BETWEEN 0 AND 15),
  collected         bigint NOT NULL DEFAULT 0,  -- TOPUP + ADJUSTMENT
  spent_net         bigint NOT NULL DEFAULT 0,  -- −(BOOKING_PAYMENT + BOOKING_REFUND)
  in_wallets        bigint NOT NULL DEFAULT 0,  -- Σ wallets.balance
  played            bigint NOT NULL DEFAULT 0,  -- Σ (amount + commission) de BOOKING_CREDIT
  commission        bigint NOT NULL DEFAULT 0,  -- Σ commission de BOOKING_CREDIT
  pending_to_venues bigint NOT NULL DEFAULT 0,  -- Σ venue_ledger.amount
  paid_to_venues    bigint NOT NULL DEFAULT 0   -- Σ venue_settlements.amount
);
INSERT INTO public.business_totals_shards(slot)
SELECT g FROM generate_series(0, 15) g
ON CONFLICT (slot) DO NOTHING;

ALTER TABLE public.business_totals_shards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_totals_shards FROM PUBLIC, anon, authenticated;

-- Registro de las verificaciones que encontraron diferencias
CREATE TABLE IF NOT EXISTS public.business_totals_audit (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  drift      jsonb NOT NULL
);
ALTER TABLE public.business_totals_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_totals_audit FROM PUBLIC, anon, authenticated;

-- 2. Fila de la transacción actual (estable dentro de la transacción)
CREATE OR REPLACE FUNCTION public.bt_slot()
RETURNS smallint LANGUAGE sql VOLATILE AS $$
  SELECT (((hashtext(pg_current_xact_id()::text) % 16) + 16) % 16)::smallint;
$$;

-- 3. Aplicar un cambio (se salta si todo es cero, para no bloquear de gusto)
CREATE OR REPLACE FUNCTION public.bt_apply(
  d_collected bigint, d_spent_net bigint, d_in_wallets bigint,
  d_played bigint, d_commission bigint, d_pending bigint, d_paid bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF d_collected = 0 AND d_spent_net = 0 AND d_in_wallets = 0 AND d_played = 0
     AND d_commission = 0 AND d_pending = 0 AND d_paid = 0 THEN
    RETURN;
  END IF;
  UPDATE public.business_totals_shards
     SET collected         = collected         + d_collected,
         spent_net         = spent_net         + d_spent_net,
         in_wallets        = in_wallets        + d_in_wallets,
         played            = played            + d_played,
         commission        = commission        + d_commission,
         pending_to_venues = pending_to_venues + d_pending,
         paid_to_venues    = paid_to_venues    + d_paid
   WHERE slot = public.bt_slot();
END;
$$;

-- 4. Triggers por fila: suman NEW y restan OLD (sirve para INSERT, UPDATE y DELETE)
CREATE OR REPLACE FUNCTION public.bt_wallet_tx_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c bigint := 0; s bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.kind IN ('TOPUP', 'ADJUSTMENT') THEN c := c + NEW.amount; END IF;
    IF NEW.kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND') THEN s := s - NEW.amount; END IF;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.kind IN ('TOPUP', 'ADJUSTMENT') THEN c := c - OLD.amount; END IF;
    IF OLD.kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND') THEN s := s + OLD.amount; END IF;
  END IF;
  PERFORM public.bt_apply(c, s, 0, 0, 0, 0, 0);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bt_wallets_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN w := w + NEW.balance; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN w := w - OLD.balance; END IF;
  PERFORM public.bt_apply(0, 0, w, 0, 0, 0, 0);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bt_venue_ledger_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p bigint := 0; c bigint := 0; d bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    d := d + NEW.amount;
    IF NEW.kind = 'BOOKING_CREDIT' THEN p := p + NEW.amount + NEW.commission; c := c + NEW.commission; END IF;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    d := d - OLD.amount;
    IF OLD.kind = 'BOOKING_CREDIT' THEN p := p - OLD.amount - OLD.commission; c := c - OLD.commission; END IF;
  END IF;
  PERFORM public.bt_apply(0, 0, 0, p, c, d, 0);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bt_venue_settlements_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a bigint := 0;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN a := a + NEW.amount; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN a := a - OLD.amount; END IF;
  PERFORM public.bt_apply(0, 0, 0, 0, 0, 0, a);
  RETURN NULL;
END;
$$;

-- 5. Verificar y corregir. Todas las sumas salen de UNA consulta (misma foto), y como los
--    triggers escriben en la misma transacción que el movimiento, en esa foto real y
--    precalculado tienen que coincidir. La diferencia se suma a la fila 0; si mientras tanto
--    entran movimientos nuevos, afectan igual a ambos lados y la corrección sigue siendo exacta.
CREATE OR REPLACE FUNCTION public.business_totals_verify()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      - (SELECT sum(played) FROM public.business_totals_shards)                                   AS played,
    (SELECT coalesce(sum(commission) FILTER (WHERE kind = 'BOOKING_CREDIT'), 0) FROM public.venue_ledger)
      - (SELECT sum(commission) FROM public.business_totals_shards)                               AS commission,
    (SELECT coalesce(sum(amount), 0) FROM public.venue_ledger)
      - (SELECT sum(pending_to_venues) FROM public.business_totals_shards)                        AS pending_to_venues,
    (SELECT coalesce(sum(amount), 0) FROM public.venue_settlements)
      - (SELECT sum(paid_to_venues) FROM public.business_totals_shards)                           AS paid_to_venues
  INTO r;

  v_drift := to_jsonb(r);
  IF r.collected = 0 AND r.spent_net = 0 AND r.in_wallets = 0 AND r.played = 0
     AND r.commission = 0 AND r.pending_to_venues = 0 AND r.paid_to_venues = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.business_totals_shards
     SET collected         = collected         + r.collected,
         spent_net         = spent_net         + r.spent_net,
         in_wallets        = in_wallets        + r.in_wallets,
         played            = played            + r.played,
         commission        = commission        + r.commission,
         pending_to_venues = pending_to_venues + r.pending_to_venues,
         paid_to_venues    = paid_to_venues    + r.paid_to_venues
   WHERE slot = 0;
  INSERT INTO public.business_totals_audit(drift) VALUES (v_drift);
  RETURN jsonb_build_object('ok', false, 'corrected', v_drift);
END;
$$;

-- TRUNCATE no dispara triggers por fila: después de uno, se recalcula
CREATE OR REPLACE FUNCTION public.bt_truncate_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.business_totals_verify();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_slot()                                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bt_apply(bigint, bigint, bigint, bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_totals_verify()                                        FROM PUBLIC, anon, authenticated;

-- 6. Triggers
DROP TRIGGER IF EXISTS bt_wallet_tx ON public.wallet_transactions;
CREATE TRIGGER bt_wallet_tx AFTER INSERT OR UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bt_wallet_tx_trg();
DROP TRIGGER IF EXISTS bt_wallets ON public.wallets;
CREATE TRIGGER bt_wallets AFTER INSERT OR UPDATE OF balance OR DELETE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.bt_wallets_trg();
DROP TRIGGER IF EXISTS bt_venue_ledger ON public.venue_ledger;
CREATE TRIGGER bt_venue_ledger AFTER INSERT OR UPDATE OR DELETE ON public.venue_ledger
  FOR EACH ROW EXECUTE FUNCTION public.bt_venue_ledger_trg();
DROP TRIGGER IF EXISTS bt_venue_settlements ON public.venue_settlements;
CREATE TRIGGER bt_venue_settlements AFTER INSERT OR UPDATE OR DELETE ON public.venue_settlements
  FOR EACH ROW EXECUTE FUNCTION public.bt_venue_settlements_trg();

DROP TRIGGER IF EXISTS bt_truncate ON public.wallet_transactions;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.wallet_transactions FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();
DROP TRIGGER IF EXISTS bt_truncate ON public.wallets;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.wallets             FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();
DROP TRIGGER IF EXISTS bt_truncate ON public.venue_ledger;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.venue_ledger        FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();
DROP TRIGGER IF EXISTS bt_truncate ON public.venue_settlements;
CREATE TRIGGER bt_truncate AFTER TRUNCATE ON public.venue_settlements   FOR EACH STATEMENT EXECUTE FUNCTION public.bt_truncate_trg();

-- 7. Carga inicial: con los triggers ya activos, la verificación pone los valores reales.
--    Se bloquea la escritura en esas tablas solo durante esta migración para que la carga
--    sea exacta (hoy son pocas filas: es instantáneo).
--    Va en un solo DO: es una única sentencia atómica (db push no envuelve la migración en
--    una transacción, y LOCK TABLE la necesita).
DO $$
BEGIN
  LOCK TABLE public.wallet_transactions, public.wallets, public.venue_ledger, public.venue_settlements IN SHARE MODE;
  UPDATE public.business_totals_shards
     SET collected = 0, spent_net = 0, in_wallets = 0, played = 0, commission = 0,
         pending_to_venues = 0, paid_to_venues = 0;
  PERFORM public.business_totals_verify();
  -- La carga inicial no es una "diferencia": no se deja en el registro
  DELETE FROM public.business_totals_audit;
END $$;

-- 8. Tarjetas de Balances: 16 filas en vez de recorrer el historial
CREATE OR REPLACE FUNCTION public.admin_balances_summary()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;

  SELECT sum(collected) AS collected, sum(spent_net) AS spent_net, sum(in_wallets) AS in_wallets,
         sum(played) AS played, sum(commission) AS commission,
         sum(pending_to_venues) AS pending_to_venues, sum(paid_to_venues) AS paid_to_venues
    INTO t
    FROM public.business_totals_shards;

  RETURN json_build_object(
    'collected',         t.collected,
    'inWallets',         t.in_wallets,
    'spentPlayed',       t.played,
    'spentNotPlayed',    t.spent_net - t.played,
    'commission',        t.commission,
    'paidToVenues',      t.paid_to_venues,
    'pendingToVenues',   t.pending_to_venues,
    -- Como mucho una pendiente por complejo (índice parcial payout_one_pending)
    'requestedByVenues', coalesce((SELECT sum(amount) FROM public.venue_payout_requests WHERE status = 'PENDING'), 0),
    'balanced',          t.collected = t.in_wallets + t.spent_net
  );
END;
$$;

-- 9. Verificación diaria 03:30 AR (06:30 UTC)
SELECT cron.unschedule('verify-business-totals')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-business-totals');
SELECT cron.schedule('verify-business-totals', '30 6 * * *', 'SELECT public.business_totals_verify()');

NOTIFY pgrst, 'reload schema';
