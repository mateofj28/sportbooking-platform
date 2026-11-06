-- ============================================================
-- 011_profiles_delete_admin.sql
-- Permite que el ADMIN general elimine perfiles de otros usuarios.
-- Sin esta política, el RLS bloquea DELETE en profiles para todos
-- excepto para el propio usuario (que tampoco tenía política DELETE).
-- ============================================================

CREATE POLICY "profiles_delete_admin"
  ON public.profiles
  FOR DELETE
  USING (public.is_admin());
