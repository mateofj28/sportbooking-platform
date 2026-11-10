-- SportBooking — Las reservas solo se crean y modifican a través de las Edge Functions
-- Migración: 028_bookings_writes_only_via_functions.sql
--
-- Problema: 003 dejó políticas RLS de INSERT y UPDATE en bookings para usuarios
-- autenticados. Con la clave pública y su sesión, un usuario podía, llamando a la
-- API directamente (sin pasar por las Edge Functions):
--   * marcar como pagada su reserva sin pagar (UPDATE payment_status = 'PAID'),
--   * cambiarle el precio, el horario o el estado (UPDATE),
--   * crear una reserva con precio 0 y ya pagada (INSERT),
--   * y un admin, marcar como pagada la reserva de otra persona.
-- La regla de negocio es que el pago lo hace SOLO el titular, por mark-paid (canPay).
--
-- Ninguna pantalla escribe en bookings directo: todo pasa por las Edge Functions
-- (create-booking, create-recurring, cancel-booking, cancel-recurring, mark-paid y
-- los crons), que usan la clave de servicio y validan permisos, precio y horario.
--
-- Solución:
--   1. Se quitan las políticas INSERT/UPDATE: los usuarios siguen LEYENDO sus
--      reservas (políticas SELECT intactas), pero no pueden escribir. RLS activo y
--      sin política = denegado.
--   2. Defensa en profundidad: un trigger rechaza cualquier cambio de pago
--      (payment_status / paid_at) hecho con un rol de usuario (authenticated/anon),
--      aunque en el futuro alguien vuelva a abrir una política de escritura.
--      Las Edge Functions (service_role) y los crons no se ven afectados.
-- Reversible: recrear las políticas. No toca datos.
-- ============================================================

-- 1. Sin escritura directa de usuarios
DROP POLICY IF EXISTS "bookings_insert_client"      ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_admin"       ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_client"      ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_venue_admin" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_admin"       ON public.bookings;

-- 2. El pago solo lo registra el sistema
CREATE OR REPLACE FUNCTION public.guard_booking_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user es el rol de la petición: 'authenticated'/'anon' desde la API con la
  -- clave pública; 'service_role' desde las Edge Functions; 'postgres' en migraciones/crons.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'PAID' OR NEW.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'El pago de una reserva solo se registra al pagarla' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'El pago de una reserva solo se registra al pagarla' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_booking_payment ON public.bookings;
CREATE TRIGGER guard_booking_payment
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_payment();
