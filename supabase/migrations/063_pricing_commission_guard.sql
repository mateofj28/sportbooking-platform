-- ============================================================
-- 063 · La comisión de la empresa (pricing.profit_percent) solo la define el admin general
--
-- Problema: en Precios, el admin de sede ve el % en solo lectura, pero eso era solo la pantalla.
-- Las políticas RLS le dejan insertar y editar cualquier columna, así que por la API podía poner
-- 0% (o borrar la tarifa y crearla de nuevo con 0%).
--
-- Regla (la garantiza la base):
--   - Admin general, Edge Functions (service role) y migraciones: sin cambios.
--   - Admin de sede (o cualquier otro usuario con sesión):
--       * EDITAR una tarifa cambiando el %: se rechaza.
--       * CREAR una tarifa: el % que mande se ignora. Se usa el % vigente de esa cancha
--         (su tarifa más reciente), si no el de otra cancha de su complejo, y si no hay ninguna,
--         10% (el valor que mostraba la pantalla).
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_pricing_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inherited numeric;
BEGIN
  -- Sin usuario (service role / migraciones) o admin general: puede todo
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.profit_percent IS DISTINCT FROM OLD.profit_percent THEN
      RAISE EXCEPTION 'La comisión la define la administración general' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: heredar el % vigente (no el que mande el admin de sede)
  SELECT p.profit_percent INTO v_inherited
    FROM public.pricing p
   WHERE p.facility_id = NEW.facility_id
   ORDER BY coalesce(p.updated_at, p.created_at) DESC
   LIMIT 1;

  IF v_inherited IS NULL THEN
    SELECT p.profit_percent INTO v_inherited
      FROM public.pricing p
      JOIN public.facilities f  ON f.id  = p.facility_id
      JOIN public.facilities nf ON nf.id = NEW.facility_id
     WHERE f.venue_id = nf.venue_id
     ORDER BY coalesce(p.updated_at, p.created_at) DESC
     LIMIT 1;
  END IF;

  NEW.profit_percent := coalesce(v_inherited, 10);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pricing_commission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_pricing_commission ON public.pricing;
CREATE TRIGGER guard_pricing_commission
  BEFORE INSERT OR UPDATE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.guard_pricing_commission();

-- Para la pantalla de Precios: el % que va a recibir una tarifa nueva de esa cancha
-- (misma regla que el trigger), así el admin de sede ve el precio final correcto antes de guardar.
CREATE OR REPLACE FUNCTION public.pricing_default_commission(p_facility uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT p.profit_percent FROM public.pricing p
      WHERE p.facility_id = p_facility
      ORDER BY coalesce(p.updated_at, p.created_at) DESC LIMIT 1),
    (SELECT p.profit_percent FROM public.pricing p
       JOIN public.facilities f  ON f.id = p.facility_id
       JOIN public.facilities nf ON nf.id = p_facility
      WHERE f.venue_id = nf.venue_id
      ORDER BY coalesce(p.updated_at, p.created_at) DESC LIMIT 1),
    10
  );
$$;

REVOKE ALL ON FUNCTION public.pricing_default_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pricing_default_commission(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
