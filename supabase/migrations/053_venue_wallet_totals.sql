-- SportBooking — Total de la columna "Créditos" en la Billetera de la sede
-- Migración: 053_venue_wallet_totals.sql
--
-- venue_wallet (045) devuelve además la suma de TODOS los movimientos que cumplen los
-- filtros (no solo los de la página): entradas (turnos jugados), salidas (pagos) y neto.
-- Se agrega a la definición vigente sin reescribir el resto de la función.
-- ============================================================

DO $$
DECLARE
  def    text;
  anchor text := '''total'',     (SELECT count(*) FROM f),';
BEGIN
  def := pg_get_functiondef('public.venue_wallet(uuid, text, text, text, integer, integer)'::regprocedure);
  IF position(anchor IN def) = 0 THEN
    RAISE EXCEPTION 'venue_wallet: no se encontró el punto de inserción (¿cambió la función?)';
  END IF;
  def := replace(def, anchor, anchor || '
      ''sumIn'',     coalesce((SELECT sum(amount) FROM f WHERE amount > 0), 0),
      ''sumOut'',    coalesce((SELECT -sum(amount) FROM f WHERE amount < 0), 0),
      ''sumNet'',    coalesce((SELECT sum(amount) FROM f), 0),');
  EXECUTE def;
END $$;
