-- SportBooking — Qué puede cambiar un usuario de su propio perfil
-- Migración: 039_guard_profile_self_update.sql
--
-- Problema (grave): la política "profiles_update_own" (003) deja que cada usuario
-- actualice SU fila sin limitar columnas. Desde la API pública un cliente podía hacer
--   update profiles set role = 'ADMIN' where id = auth.uid()
-- y pasar a ser admin general (los permisos se leen de profiles: get_my_role()).
-- También podía cambiar su venue_id, is_active, DNI, email y su nombre.
--
-- Ahora, cuando la escritura viene de la API con un usuario que NO es ADMIN general,
-- solo puede cambiar: teléfono, foto (avatar_url) y provincia. Nombre, apellido, DNI y
-- email quedan fijos (los corrige el admin general). El teléfono nuevo se valida.
--
-- No cambia nada para:
--   - el ADMIN general (panel de usuarios, política profiles_update_admin),
--   - las Edge Functions con service_role (admin-create-user, admin-set-role),
--   - funciones SECURITY DEFINER (set_user_role, handle_new_user).
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_local text;
  v_digits int;
BEGIN
  -- Teléfono vacío = sin teléfono
  NEW.phone := NULLIF(btrim(NEW.phone), '');

  -- Solo se limita lo que llega por la API con la sesión de un usuario.
  -- (service_role y las funciones SECURITY DEFINER corren con otro current_user)
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF NEW.id         IS DISTINCT FROM OLD.id
  OR NEW.first_name IS DISTINCT FROM OLD.first_name
  OR NEW.last_name  IS DISTINCT FROM OLD.last_name
  OR NEW.dni        IS DISTINCT FROM OLD.dni
  OR NEW.email      IS DISTINCT FROM OLD.email
  OR NEW.role       IS DISTINCT FROM OLD.role
  OR NEW.venue_id   IS DISTINCT FROM OLD.venue_id
  OR NEW.is_active  IS DISTINCT FROM OLD.is_active
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo podés modificar tu teléfono, tu foto y tu provincia'
      USING ERRCODE = '42501';
  END IF;

  -- Teléfono nuevo: "+<código> <número>", con 8 a 11 dígitos en el número
  -- (mismo formato que arma PhoneInput en el frontend). Uno viejo que no se toca no se valida.
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone IS NOT NULL THEN
    IF length(NEW.phone) > 25 OR NEW.phone !~ '^\+[0-9]{1,3} [0-9][0-9 -]*$' THEN
      RAISE EXCEPTION 'El teléfono no tiene un formato válido' USING ERRCODE = '23514';
    END IF;
    v_local  := substr(NEW.phone, position(' ' IN NEW.phone) + 1);
    v_digits := length(regexp_replace(v_local, '[^0-9]', '', 'g'));
    IF v_digits < 8 OR v_digits > 11 THEN
      RAISE EXCEPTION 'El teléfono no tiene un formato válido' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();
