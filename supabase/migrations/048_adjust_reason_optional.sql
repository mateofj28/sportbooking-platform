-- SportBooking — El motivo de una recarga / ajuste de puntos pasa a ser opcional
-- Migración: 048_adjust_reason_optional.sql
--
-- Antes (043): recargas y ajustes exigían motivo (3 a 300 caracteres).
-- Ahora: el motivo es opcional; si se escribe, hasta 300 caracteres. Sigue quedando
-- registrado quién hizo el movimiento y cuándo (created_by / created_at).
-- ============================================================

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_tx_reason;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_tx_reason CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 300);

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
  v_reason  text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_balance bigint;
  v_new     bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador general puede cargar o ajustar puntos' USING ERRCODE = 'WL003';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR abs(p_amount) > 100000000 THEN
    RAISE EXCEPTION 'La cantidad de puntos tiene que ser distinta de 0 (máximo 100,000,000)' USING ERRCODE = 'WL006';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'El motivo admite hasta 300 caracteres' USING ERRCODE = 'WL006';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
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
    v_reason, auth.uid());
  RETURN json_build_object('balance', v_new);
END;
$$;
