-- SportBooking — "Puntos" pasa a llamarse "Créditos" en toda la app
-- Migración: 051_rename_points_to_credits.sql
--
-- Solo cambia el TEXTO que ve la gente (mensajes de error, detalles de movimientos y
-- notificaciones). La regla no cambia: 1 crédito = 1 ARS. Los nombres internos (tablas,
-- columnas, funciones como wallet_*, fmt_points) se mantienen para no romper nada.
--
-- 1. Funciones con textos visibles: se reescriben a partir de su definición actual,
--    cambiando solo las palabras sueltas "puntos"/"Puntos"/"pts" (\m \M = límites de
--    palabra: no toca identificadores como fmt_points).
-- 2. Datos ya guardados: detalle de los movimientos y textos de las notificaciones.
-- ============================================================

DO $$
DECLARE
  f   record;
  def text;
BEGIN
  FOR f IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('admin_wallet_history', 'create_booking_paid', 'notify_payout_request', 'notify_venue_paid',
                         'pay_booking', 'pay_venue', 'request_venue_payout', 'wallet_admin_adjust', 'wallet_apply')
  LOOP
    def := pg_get_functiondef(f.oid);
    def := regexp_replace(def, '\mpuntos\M', 'créditos', 'g');
    def := regexp_replace(def, '\mPuntos\M', 'Créditos', 'g');
    def := regexp_replace(def, '\mpts\M',    'créditos', 'g');
    EXECUTE def;
  END LOOP;
END $$;

-- Movimientos ya guardados
UPDATE public.wallet_transactions
   SET detail = regexp_replace(detail, '\mpuntos\M', 'créditos', 'g')
 WHERE detail ~ '\mpuntos\M';

-- Notificaciones ya enviadas
UPDATE public.notifications
   SET title = regexp_replace(regexp_replace(title, '\mpuntos\M', 'créditos', 'g'), '\mpts\M', 'créditos', 'g'),
       body  = regexp_replace(regexp_replace(body,  '\mpuntos\M', 'créditos', 'g'), '\mpts\M', 'créditos', 'g')
 WHERE title ~ '\m(puntos|pts)\M' OR body ~ '\m(puntos|pts)\M';
