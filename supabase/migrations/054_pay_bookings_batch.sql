-- SportBooking — Pagar varias fechas de un turno fijo de una vez
-- Migración: 054_pay_bookings_batch.sql
--
-- Al crear un turno fijo el cliente elige: pagar todas las fechas ahora, pagar solo la
-- próxima, o solo crearlas (y pagar cada una después). Esta función paga una lista de
-- reservas del mismo titular TODO O NADA: si el saldo no alcanza para todas, no se cobra
-- ninguna (error WL001 con el total necesario). Cada fecha se cobra con pay_booking (043),
-- así que valen las mismas reglas: solo el titular, solo pendientes, una sola vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pay_bookings_batch(p_bookings uuid[], p_user uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_needed  bigint;
  v_balance bigint;
  v_id      uuid;
  v_paid    integer := 0;
  v_total   bigint := 0;
  v_res     json;
BEGIN
  IF p_bookings IS NULL OR cardinality(p_bookings) = 0 THEN
    RETURN json_build_object('paidCount', 0, 'total', 0);
  END IF;

  -- Saldo necesario (solo lo pendiente del titular) contra el saldo, con la billetera bloqueada
  SELECT coalesce(sum(round(total_price)), 0)::bigint INTO v_needed
    FROM public.bookings
   WHERE id = ANY (p_bookings) AND user_id = p_user AND payment_status = 'PENDING' AND status = 'CONFIRMED';

  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance < v_needed THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % créditos y tenés %. Te faltan %.',
      public.fmt_points(v_needed), public.fmt_points(v_balance), public.fmt_points(v_needed - v_balance)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', v_needed, 'available', v_balance, 'missing', v_needed - v_balance)::text;
  END IF;

  -- En orden de fecha; cualquier error deshace todo el lote
  FOR v_id IN
    SELECT id FROM public.bookings WHERE id = ANY (p_bookings) ORDER BY start_datetime
  LOOP
    v_res := public.pay_booking(v_id, p_user, NULL);
    IF NOT coalesce((v_res ->> 'already')::boolean, false) THEN
      v_paid  := v_paid + 1;
      v_total := v_total + coalesce((v_res ->> 'total')::bigint, 0);
    END IF;
  END LOOP;

  RETURN json_build_object('paidCount', v_paid, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_bookings_batch(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_bookings_batch(uuid[], uuid) TO service_role;
