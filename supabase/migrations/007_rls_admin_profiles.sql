-- =============================================================
-- 007_rls_admin_profiles.sql
-- Fix: permitir que el ADMIN general actualice cualquier perfil.
--
-- Problema: la política "profiles_update_own" solo permite que
-- cada usuario edite su propio perfil. El ADMIN necesita poder
-- cambiar is_active (activar/desactivar usuarios) de cualquier
-- perfil desde el panel de administración.
--
-- Solución: agregar una política UPDATE adicional que se aplica
-- exclusivamente cuando el usuario autenticado tiene rol ADMIN.
-- Usa get_my_role() (SECURITY DEFINER) para leer desde profiles,
-- evitando parsear JWT directamente.
-- =============================================================

-- Política de UPDATE para el ADMIN general en cualquier perfil
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');
