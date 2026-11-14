-- SportBooking — Tipos de notificación para los pagos a complejos (migración 045)
-- Migración: 046_notification_types_payouts.sql
--
-- Va sola porque un valor nuevo de un enum no se puede usar en la misma transacción en
-- que se agrega. Los avisos que los usan están en 047.
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_REQUESTED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_PAID';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_REJECTED';
