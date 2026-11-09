-- SportBooking — Reglas de fechas de la publicidad
-- Migración: 019_advertisements_date_rules.sql
--
-- Problema: starts_at/ends_at aceptaban cualquier valor (año 1900, 2222, 3333,
-- fechas pasadas). Un fin ya vencido deja el anuncio muerto desde que se crea.
--
-- Reglas (todas relativas a "ahora", por eso van en un trigger y no en un CHECK,
-- que debe ser inmutable):
--   1. Inicio: no puede ser anterior a HOY (día calendario en hora de Argentina).
--      Hoy sí se permite: "desde ya" es un caso válido.
--   2. Fin: debe ser futuro (posterior a ahora).
--   3. Ninguna de las dos puede superar los 2 años hacia adelante.
--
-- Solo se validan los valores NUEVOS o MODIFICADOS. Así se puede seguir editando,
-- pausando o reactivando un anuncio que ya empezó o ya venció sin que lo bloquee
-- una fecha vieja que no se tocó. La comparación es a nivel minuto, que es la
-- precisión que maneja el formulario.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_advertisement_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tz         constant text        := 'America/Argentina/Buenos_Aires';
  v_today_ar   date                 := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_max        timestamptz          := now() + interval '2 years';
  v_start_chg  boolean;
  v_end_chg    boolean;
BEGIN
  v_start_chg := NEW.starts_at IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR date_trunc('minute', NEW.starts_at) IS DISTINCT FROM date_trunc('minute', OLD.starts_at)
  );
  v_end_chg := NEW.ends_at IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR date_trunc('minute', NEW.ends_at) IS DISTINCT FROM date_trunc('minute', OLD.ends_at)
  );

  IF v_start_chg THEN
    IF (NEW.starts_at AT TIME ZONE v_tz)::date < v_today_ar THEN
      RAISE EXCEPTION 'La fecha de inicio no puede ser anterior a hoy'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.starts_at > v_max THEN
      RAISE EXCEPTION 'La fecha de inicio no puede superar los 2 años desde hoy'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_end_chg THEN
    IF NEW.ends_at <= now() THEN
      RAISE EXCEPTION 'La fecha de fin debe ser futura'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.ends_at > v_max THEN
      RAISE EXCEPTION 'La fecha de fin no puede superar los 2 años desde hoy'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_advertisement_dates ON public.advertisements;
CREATE TRIGGER validate_advertisement_dates
  BEFORE INSERT OR UPDATE OF starts_at, ends_at ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.validate_advertisement_dates();
