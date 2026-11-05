-- ============================================================
-- 008_trigger_dni_phone.sql
-- Actualiza handle_new_user para guardar phone y dni desde
-- user_metadata al crear el perfil.
--
-- El frontend pasa estos campos en options.data al registrarse:
--   { first_name, last_name, phone, dni }
-- Supabase los guarda en auth.users.raw_user_meta_data.
-- Este trigger los copia a public.profiles al crear la fila.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    dni,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'dni', '')), ''),
    'CLIENT',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
