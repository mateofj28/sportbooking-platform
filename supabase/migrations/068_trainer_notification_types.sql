-- ============================================================
-- 068 — Entrenadores, Etapa 4: tipos de aviso nuevos (spec entrenadores, design 2.7)
-- Va sola: un valor nuevo de un enum no se puede usar en la misma transacción que lo agrega.
-- ============================================================
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TRAINER_PUBLISHED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'CLASS_BOOKED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'CLASS_CANCELLED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'CLASS_AUTO_CANCELLED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'CLASS_REMINDER';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TRAINER_PAYOUT_REQUESTED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TRAINER_PAYOUT_PAID';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'TRAINER_PAYOUT_REJECTED';
