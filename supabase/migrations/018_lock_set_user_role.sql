-- SportBooking — Cerrar set_user_role (escalamiento de privilegios)
-- Migración: 018_lock_set_user_role.sql
--
-- Problema (crítico): set_user_role es SECURITY DEFINER, cambia profiles.role y
-- auth.users.raw_app_meta_data, y NO valida quién la llama. Su propio comentario
-- decía "solo ejecutable con service_role", pero nunca se revocó el EXECUTE que
-- Postgres concede a PUBLIC por defecto. Resultado: cualquier persona con la clave
-- pública (incluso sin sesión) podía llamar supabase.rpc('set_user_role', ...) y
-- convertir su cuenta (o la de otro) en ADMIN.
--
-- Solución: solo service_role puede ejecutarla. La invocan las Edge Functions
-- admin-set-role y admin-create-user, que usan la clave de servicio y (desde este
-- cambio) validan que el llamador sea ADMIN.
-- ============================================================

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text, uuid) TO service_role;
