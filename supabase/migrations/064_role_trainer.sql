-- ============================================================
-- 064 · Rol TRAINER (entrenador) — spec .kiro/specs/entrenadores (E9)
-- Va sola: un valor nuevo de un enum no se puede usar en la misma transacción que lo agrega.
-- Los helpers de RLS ya lo tratan de forma segura: is_admin() / is_venue_admin() dan false y
-- get_my_role() devuelve 'TRAINER'.
-- ============================================================
ALTER TYPE public.role ADD VALUE IF NOT EXISTS 'TRAINER';
