-- SportBooking — Cambios de reservas en tiempo real para el panel de administración
-- Migración: 022_realtime_bookings.sql
--
-- El panel de reservas se refresca solo cuando una reserva se crea, se paga o
-- se cancela (sin polling). Usa `postgres_changes` sobre public.bookings.
--
-- Por qué postgres_changes acá (y broadcast en la disponibilidad, migración 020):
--   Realtime evalúa el RLS de bookings con el JWT de cada suscriptor antes de
--   enviarle un cambio. Un ADMIN recibe todo, un VENUE_ADMIN solo lo de su
--   complejo y un CLIENT solo lo suyo: nadie recibe filas que no puede leer.
--   La pantalla del cliente necesita enterarse de reservas AJENAS, por eso allá
--   va un aviso mínimo por broadcast; acá el RLS ya da el alcance correcto.
--
-- Idempotente: solo agrega la tabla si todavía no está publicada.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
