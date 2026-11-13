-- SportBooking — Cada complejo pertenece a un MUNICIPIO del catálogo oficial
-- Migración: 041_venues_municipality.sql
--
-- Antes: venues.city era texto libre elegido de las LOCALIDADES de Georef (ej. "Ramos
-- Mejía"), que no siempre coincide con el MUNICIPIO ("La Matanza"). La publicidad y el
-- selector "¿Dónde querés jugar?" trabajan con municipios (ar_localities, 034), así que
-- un complejo podía no aparecer en su municipio.
--
-- Ahora: venues.locality_code apunta a ar_localities. La base completa sola city (nombre
-- del municipio) y state (provincia), así no pueden quedar inconsistentes.
-- Un complejo nuevo, o uno al que le cambian la ubicación, debe tener municipio. Los que
-- no se tocan siguen funcionando aunque todavía no lo tengan.
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS locality_code text REFERENCES public.ar_localities(code);

CREATE INDEX IF NOT EXISTS idx_venues_locality_code ON public.venues(locality_code);

-- Nombre de provincia (ISO 3166-2:AR) — el mismo texto que usa el frontend (lib/ar-provinces.ts)
CREATE OR REPLACE FUNCTION public.ar_province_name(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_code
    WHEN 'AR-B' THEN 'Buenos Aires'
    WHEN 'AR-K' THEN 'Catamarca'
    WHEN 'AR-H' THEN 'Chaco'
    WHEN 'AR-U' THEN 'Chubut'
    WHEN 'AR-C' THEN 'Ciudad Autónoma de Buenos Aires'
    WHEN 'AR-X' THEN 'Córdoba'
    WHEN 'AR-W' THEN 'Corrientes'
    WHEN 'AR-E' THEN 'Entre Ríos'
    WHEN 'AR-P' THEN 'Formosa'
    WHEN 'AR-Y' THEN 'Jujuy'
    WHEN 'AR-L' THEN 'La Pampa'
    WHEN 'AR-F' THEN 'La Rioja'
    WHEN 'AR-M' THEN 'Mendoza'
    WHEN 'AR-N' THEN 'Misiones'
    WHEN 'AR-Q' THEN 'Neuquén'
    WHEN 'AR-R' THEN 'Río Negro'
    WHEN 'AR-A' THEN 'Salta'
    WHEN 'AR-J' THEN 'San Juan'
    WHEN 'AR-D' THEN 'San Luis'
    WHEN 'AR-Z' THEN 'Santa Cruz'
    WHEN 'AR-S' THEN 'Santa Fe'
    WHEN 'AR-G' THEN 'Santiago del Estero'
    WHEN 'AR-V' THEN 'Tierra del Fuego'
    WHEN 'AR-T' THEN 'Tucumán'
  END;
$$;

CREATE OR REPLACE FUNCTION public.venue_fill_municipality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_prov text;
BEGIN
  IF NEW.locality_code IS NOT NULL THEN
    SELECT name, province_code INTO v_name, v_prov
      FROM public.ar_localities WHERE code = NEW.locality_code;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'El municipio elegido no existe' USING ERRCODE = '23503';
    END IF;
    NEW.city  := v_name;
    NEW.state := public.ar_province_name(v_prov);
    RETURN NEW;
  END IF;

  -- Sin municipio: solo se acepta si es un complejo existente cuya ubicación no cambia
  IF TG_OP = 'INSERT'
     OR NEW.city  IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR OLD.locality_code IS NOT NULL THEN
    RAISE EXCEPTION 'Elegí el municipio del complejo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venue_fill_municipality ON public.venues;
CREATE TRIGGER venue_fill_municipality
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venue_fill_municipality();

-- Complejos existentes: asignar el municipio cuando el nombre y la provincia coinciden
-- con UN solo municipio del catálogo.
WITH candidates AS (
  SELECT v.id, min(l.code) AS code, count(*) AS n
    FROM public.venues v
    JOIN public.ar_localities l
      ON lower(l.name) = lower(btrim(v.city))
     AND public.ar_province_name(l.province_code) = v.state
   WHERE v.locality_code IS NULL
   GROUP BY v.id
)
UPDATE public.venues v
   SET locality_code = c.code
  FROM candidates c
 WHERE c.id = v.id AND c.n = 1;
