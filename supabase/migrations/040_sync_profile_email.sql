-- SportBooking — El email del perfil sigue al email de la cuenta (Supabase Auth)
-- Migración: 040_sync_profile_email.sql
--
-- El usuario puede cambiar su email desde "Mi Perfil". Ese cambio se hace en Supabase
-- Auth (supabase.auth.updateUser), que manda un link de confirmación; recién cuando se
-- confirma cambia auth.users.email. Este trigger copia ese valor a profiles.email, que
-- es el que usan los paneles (directorio, búsqueda por email).
--
-- profiles.email NO se escribe directo desde la API (guard_profile_update, 039): así no
-- puede quedar un email de perfil distinto del de la cuenta.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET email = NEW.email
   WHERE id = NEW.id
     AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();

-- Corregir los que hoy estén desincronizados
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE p.id = u.id
   AND p.email IS DISTINCT FROM u.email;

-- Mensaje del guard (039): el email se cambia desde la cuenta, no escribiendo el perfil.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_local text;
  v_digits int;
BEGIN
  NEW.phone := NULLIF(btrim(NEW.phone), '');

  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'El email se cambia desde Mi Perfil y se confirma con el link que te enviamos'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id         IS DISTINCT FROM OLD.id
  OR NEW.first_name IS DISTINCT FROM OLD.first_name
  OR NEW.last_name  IS DISTINCT FROM OLD.last_name
  OR NEW.dni        IS DISTINCT FROM OLD.dni
  OR NEW.role       IS DISTINCT FROM OLD.role
  OR NEW.venue_id   IS DISTINCT FROM OLD.venue_id
  OR NEW.is_active  IS DISTINCT FROM OLD.is_active
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo podés modificar tu teléfono, tu email, tu foto y tu provincia'
      USING ERRCODE = '42501';
  END IF;

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
