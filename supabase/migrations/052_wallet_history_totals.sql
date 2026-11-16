-- SportBooking — Total de la columna "Créditos" en el historial global
-- Migración: 052_wallet_history_totals.sql
--
-- admin_wallet_history (045/051) devuelve además la suma de TODOS los movimientos que
-- cumplen los filtros (no solo los de la página): entradas, salidas y neto.
-- Resto idéntico.
-- ============================================================

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
             CASE WHEN t.kind = 'TOPUP' THEN 'Carga de créditos a ' ELSE 'Ajuste a ' END
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
      'total',    (SELECT count(*) FROM f),
      'sumIn',    coalesce((SELECT sum(amount) FROM f WHERE amount > 0), 0),
      'sumOut',   coalesce((SELECT -sum(amount) FROM f WHERE amount < 0), 0),
      'sumNet',   coalesce((SELECT sum(amount) FROM f), 0),
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
