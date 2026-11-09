-- SportBooking — Tope de 2 años de la publicidad por DÍA (no por instante)
-- Migración: 024_advertisements_max_by_day.sql
--
-- Problema: 019 comparaba contra el instante `now() + 2 años`. El formulario
-- (maxAdDate / advertisementSchema) valida por DÍA: permite cualquier hora del día
-- tope. Resultado: hoy a las 10:00, un fin el día tope a las 23:59 pasaba en la
-- pantalla y la base lo rechazaba.
--
-- Regla única (pantalla, Zod y base): el día calendario en hora de Argentina no
-- puede superar HOY + 2 años. `date + interval '2 years'` ajusta el 29/02 al
-- 28/02 en años no bisiestos; addYearsToDate() del frontend hace lo mismo.
--
-- El resto de la lógica es idéntico a 019.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_advertisement_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tz         constant text := 'America/Argentina/Buenos_Aires';
  v_today_ar   date          := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_max_day    date          := ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + interval '2 years')::date;
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
    IF (NEW.starts_at AT TIME ZONE v_tz)::date > v_max_day THEN
      RAISE EXCEPTION 'La fecha de inicio no puede superar los 2 años desde hoy'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_end_chg THEN
    IF NEW.ends_at <= now() THEN
      RAISE EXCEPTION 'La fecha de fin debe ser futura'
        USING ERRCODE = '23514';
    END IF;
    IF (NEW.ends_at AT TIME ZONE v_tz)::date > v_max_day THEN
      RAISE EXCEPTION 'La fecha de fin no puede superar los 2 años desde hoy'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
