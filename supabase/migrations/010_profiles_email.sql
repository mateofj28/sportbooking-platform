-- ============================================================
-- 010_profiles_email.sql
-- Agrega columna email a profiles y actualiza handle_new_user
-- para copiarlo desde auth.users al registrarse.
--
-- El email ya está en auth.users.email — lo sincronizamos a
-- profiles para poder buscarlo/mostrarlo sin necesitar
-- service_role ni joins a auth.users (que no es accesible
-- desde el cliente con RLS).
-- ============================================================

-- Agregar columna email si no existe
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Poblar el email para los usuarios existentes desde auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- Actualizar el trigger para guardar email en nuevos registros
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
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
    NEW.email,
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
