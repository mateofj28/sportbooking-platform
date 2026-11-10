-- SportBooking — Límite del motivo de cancelación
-- Migración: 026_cancellation_reason_limit.sql
--
-- Problema: el formulario (Zod, CANCEL_REASON_MAX) corta el motivo en 300
-- caracteres, pero la columna aceptaba cualquier largo. Llamando a la Edge
-- Function directamente se podía guardar un texto enorme.
--
-- Regla (igual en Zod, en las Edge Functions y acá): NULL, o entre 1 y 300
-- caracteres. Un motivo vacío se guarda como NULL (lo normalizan las funciones).
-- Al crear la restricción no había ningún motivo guardado.
-- ============================================================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_reason_len;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_cancellation_reason_len
  CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 300);
