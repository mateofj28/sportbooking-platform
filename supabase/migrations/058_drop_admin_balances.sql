-- ============================================================
-- 058 · Borrar admin_balances()
-- La reemplazaron en 056/057: admin_balances_summary, admin_payout_pending_count,
-- admin_venue_balances, admin_payout_requests y admin_venue_payments. El frontend ya
-- publicado no la usa.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_balances();

NOTIFY pgrst, 'reload schema';
