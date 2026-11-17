-- ============================================================
-- 056 · Pagos a complejos: consultas separadas, filtradas y paginadas en la base
--
-- Antes, admin_balances() devolvía todo junto (tarjetas + saldo por complejo + solicitudes +
-- últimos 50 pagos) y el filtro por complejo se hacía en el navegador sobre esos 50.
-- Ahora cada parte tiene su función y solo trae lo que se muestra:
--   admin_balances_summary()      tarjetas de Balances
--   admin_payout_pending_count()  número de la pestaña "Solicitudes de pago"
--   admin_venue_balances(...)     saldo por complejo: un solo GROUP BY, paginado, con totales
--   admin_payout_requests(...)    solicitudes pendientes (a lo sumo una por complejo)
--   admin_venue_payments(...)     pagos realizados: complejo, fechas AR, nº de transferencia,
--                                 paginado, con total del monto
-- admin_balances() queda por compatibilidad con la versión anterior del frontend mientras se
-- publica la nueva; se puede borrar después.
-- ============================================================

-- 1. Índices para paginar los pagos sin recorrer la tabla
CREATE INDEX IF NOT EXISTS idx_venue_settlements_venue_created ON public.venue_settlements(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_settlements_created       ON public.venue_settlements(created_at DESC);
-- "¿este pago salió de una solicitud?" (EXISTS por settlement_id)
CREATE INDEX IF NOT EXISTS idx_payout_requests_settlement ON public.venue_payout_requests(settlement_id)
  WHERE settlement_id IS NOT NULL;

-- 2. Tarjetas de Balances (sin las tablas)
CREATE OR REPLACE FUNCTION public.admin_balances_summary()
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
  v_commission bigint;
  v_pending    bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_collected FROM public.wallet_transactions WHERE kind IN ('TOPUP', 'ADJUSTMENT');
  SELECT coalesce(sum(balance), 0) INTO v_in_wallets FROM public.wallets;
  SELECT coalesce(-sum(amount), 0) INTO v_spent_net FROM public.wallet_transactions WHERE kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND');
  -- Una sola pasada por el libro de los complejos
  SELECT coalesce(sum(amount + commission) FILTER (WHERE kind = 'BOOKING_CREDIT'), 0),
         coalesce(sum(commission)          FILTER (WHERE kind = 'BOOKING_CREDIT'), 0),
         coalesce(sum(amount), 0)
    INTO v_played, v_commission, v_pending
    FROM public.venue_ledger;

  RETURN json_build_object(
    'collected',         v_collected,
    'inWallets',         v_in_wallets,
    'spentPlayed',       v_played,
    'spentNotPlayed',    v_spent_net - v_played,
    'commission',        v_commission,
    'paidToVenues',      coalesce((SELECT sum(amount) FROM public.venue_settlements), 0),
    'pendingToVenues',   v_pending,
    'requestedByVenues', coalesce((SELECT sum(amount) FROM public.venue_payout_requests WHERE status = 'PENDING'), 0),
    'balanced',          v_collected = v_in_wallets + v_spent_net
  );
END;
$$;

-- 3. Cantidad de solicitudes pendientes (indicador de la pestaña)
CREATE OR REPLACE FUNCTION public.admin_payout_pending_count()
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (SELECT count(*)::int FROM public.venue_payout_requests WHERE status = 'PENDING');
END;
$$;

-- 4. Saldo por complejo: los que más hay que pagar primero, paginado, con totales
CREATE OR REPLACE FUNCTION public.admin_venue_balances(
  p_venue uuid DEFAULT NULL,
  p_page  int  DEFAULT 1,
  p_size  int  DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH l AS (
      SELECT venue_id,
             sum(amount)::bigint                                                 AS balance,
             coalesce(sum(amount) FILTER (WHERE kind = 'BOOKING_CREDIT'), 0)::bigint AS earned,
             coalesce(sum(commission), 0)::bigint                                AS commission
        FROM public.venue_ledger
       WHERE p_venue IS NULL OR venue_id = p_venue
       GROUP BY venue_id
    ), r AS (
      SELECT venue_id, sum(amount)::bigint AS reserved
        FROM public.venue_payout_requests
       WHERE status = 'PENDING' AND (p_venue IS NULL OR venue_id = p_venue)
       GROUP BY venue_id
    ), b AS (
      SELECT l.venue_id, v.name AS venue_name, l.balance, l.earned, l.commission,
             coalesce(r.reserved, 0)             AS reserved,
             l.balance - coalesce(r.reserved, 0) AS available
        FROM l
        JOIN public.venues v ON v.id = l.venue_id
        LEFT JOIN r ON r.venue_id = l.venue_id
    )
    SELECT json_build_object(
      'total',  (SELECT count(*) FROM b),
      'totals', (SELECT json_build_object(
                   'balance',    coalesce(sum(balance), 0),
                   'reserved',   coalesce(sum(reserved), 0),
                   'available',  coalesce(sum(available), 0),
                   'commission', coalesce(sum(commission), 0)) FROM b),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'venueId', x.venue_id, 'venueName', x.venue_name,
                 'balance', x.balance, 'reserved', x.reserved, 'available', x.available,
                 'earned', x.earned, 'commission', x.commission,
                 -- Solo para las filas de la página (usa el índice venue_id, created_at)
                 'lastPaidAt', (SELECT max(s.created_at) FROM public.venue_settlements s WHERE s.venue_id = x.venue_id))
               ORDER BY x.available DESC, x.venue_name)
          FROM (SELECT * FROM b ORDER BY available DESC, venue_name, venue_id
                 LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- 5. Solicitudes pendientes (a lo sumo una por complejo: payout_one_pending), las más viejas primero
CREATE OR REPLACE FUNCTION public.admin_payout_requests(p_venue uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN coalesce((
    SELECT json_agg(json_build_object(
             'id', q.id, 'venueId', q.venue_id, 'venueName', v.name, 'amount', q.amount,
             'requestedAt', q.requested_at,
             'requestedBy', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
           ORDER BY q.requested_at)
      FROM public.venue_payout_requests q
      JOIN public.venues v ON v.id = q.venue_id
      LEFT JOIN public.profiles p ON p.id = q.requested_by
     WHERE q.status = 'PENDING'
       AND (p_venue IS NULL OR q.venue_id = p_venue)
  ), '[]'::json);
END;
$$;

-- 6. Pagos realizados: filtros en la base, paginado, con total del monto filtrado
CREATE OR REPLACE FUNCTION public.admin_venue_payments(
  p_venue  uuid DEFAULT NULL,
  p_from   text DEFAULT NULL,   -- "YYYY-MM-DD" día AR
  p_to     text DEFAULT NULL,   -- "YYYY-MM-DD" día AR (incluido)
  p_search text DEFAULT NULL,   -- parte del número de transferencia
  p_page   int  DEFAULT 1,
  p_size   int  DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- El texto buscado se toma literal (sin comodines del usuario)
  IF v_search IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN (
    WITH f AS (
      SELECT s.id, s.venue_id, s.amount, s.created_at, s.transfer_ref, s.receipt_path
        FROM public.venue_settlements s
       WHERE (p_venue IS NULL OR s.venue_id = p_venue)
         AND (v_from  IS NULL OR s.created_at >= v_from)
         AND (v_to    IS NULL OR s.created_at <  v_to)
         AND (v_like  IS NULL OR s.transfer_ref ILIKE v_like)
    )
    SELECT json_build_object(
      'total',     (SELECT count(*) FROM f),
      'sumAmount', coalesce((SELECT sum(amount) FROM f), 0),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'venueId', x.venue_id, 'venueName', v.name, 'amount', x.amount,
                 'paidAt', x.created_at, 'transferRef', x.transfer_ref, 'receiptPath', x.receipt_path,
                 'requested', EXISTS (SELECT 1 FROM public.venue_payout_requests q WHERE q.settlement_id = x.id))
               ORDER BY x.created_at DESC, x.id)
          FROM (SELECT * FROM f ORDER BY created_at DESC, id LIMIT v_size OFFSET (v_page - 1) * v_size) x
          JOIN public.venues v ON v.id = x.venue_id
      ), '[]'::json)
    )
  );
END;
$$;

-- 7. Permisos (validan el rol adentro)
REVOKE ALL ON FUNCTION public.admin_balances_summary()                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payout_pending_count()                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_venue_balances(uuid, int, int)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payout_requests(uuid)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_venue_payments(uuid, text, text, text, int, int)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_balances_summary()                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payout_pending_count()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_venue_balances(uuid, int, int)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payout_requests(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_venue_payments(uuid, text, text, text, int, int)   TO authenticated;

NOTIFY pgrst, 'reload schema';
