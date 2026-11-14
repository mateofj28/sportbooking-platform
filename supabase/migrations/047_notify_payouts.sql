-- SportBooking — Avisos in-app de los pagos a complejos
-- Migración: 047_notify_payouts.sql
--
--   * PAYOUT_REQUESTED: el complejo pidió su pago   -> solo el admin general (admin_only, sin sede).
--   * PAYOUT_PAID:      se le pagó al complejo      -> admin de esa sede (con o sin solicitud).
--   * PAYOUT_REJECTED:  se rechazó su solicitud     -> admin de esa sede, con el motivo.
--
-- Se emiten con triggers sobre las tablas, así cubren cualquier camino (request_venue_payout,
-- pay_venue, reject_venue_payout) sin tocar esas funciones. Quien hizo la acción no necesita
-- el aviso: se le marca como leído (el admin general ve todas las notificaciones por RLS).
-- ============================================================

-- Inserta la notificación y la marca leída para quien la causó
CREATE OR REPLACE FUNCTION public.emit_payout_notification(
  p_type     public.notification_type,
  p_title    text,
  p_body     text,
  p_venue    uuid,
  p_admin    boolean,
  p_data     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_actor uuid := auth.uid();
BEGIN
  INSERT INTO public.notifications (type, title, body, venue_id, admin_only, data)
  VALUES (p_type, left(p_title, 200), left(p_body, 500), p_venue, p_admin, p_data)
  RETURNING id INTO v_id;

  IF v_actor IS NOT NULL THEN
    INSERT INTO public.notification_reads (notification_id, user_id)
    VALUES (v_id, v_actor)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_payout_notification(public.notification_type, text, text, uuid, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Solicitud nueva / rechazada
CREATE OR REPLACE FUNCTION public.notify_payout_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue text;
BEGIN
  SELECT name INTO v_venue FROM public.venues WHERE id = NEW.venue_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
    PERFORM public.emit_payout_notification(
      'PAYOUT_REQUESTED',
      'Solicitud de pago: ' || coalesce(v_venue, 'complejo'),
      'Pidió que le paguen ' || public.fmt_points(NEW.amount) || ' pts ($' || public.fmt_points(NEW.amount)
        || ' ARS). Pagala o rechazala desde Balances.',
      NULL, true,
      jsonb_build_object('requestId', NEW.id, 'venueId', NEW.venue_id, 'venueName', v_venue, 'amount', NEW.amount));

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
    PERFORM public.emit_payout_notification(
      'PAYOUT_REJECTED',
      'Solicitud de pago rechazada',
      'El pedido de ' || public.fmt_points(NEW.amount) || ' pts de ' || coalesce(v_venue, 'tu complejo')
        || ' fue rechazado. Motivo: ' || coalesce(NEW.reject_reason, '—')
        || '. El monto volvió a tu disponible.',
      NEW.venue_id, false,
      jsonb_build_object('requestId', NEW.id, 'venueName', v_venue, 'amount', NEW.amount, 'reason', NEW.reject_reason));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_payout_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_payout_request ON public.venue_payout_requests;
CREATE TRIGGER notify_payout_request
  AFTER INSERT OR UPDATE OF status ON public.venue_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_request();

-- Pago registrado (con o sin solicitud)
CREATE OR REPLACE FUNCTION public.notify_venue_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue text;
BEGIN
  SELECT name INTO v_venue FROM public.venues WHERE id = NEW.venue_id;
  PERFORM public.emit_payout_notification(
    'PAYOUT_PAID',
    'Pago recibido: ' || public.fmt_points(NEW.amount) || ' pts',
    'La empresa le pagó $' || public.fmt_points(NEW.amount) || ' ARS a ' || coalesce(v_venue, 'tu complejo') || '.'
      || coalesce(' Transferencia ' || NEW.transfer_ref || '.', '')
      || CASE WHEN NEW.receipt_path IS NOT NULL THEN ' El comprobante está en tu Billetera.' ELSE '' END,
    NEW.venue_id, false,
    jsonb_build_object('settlementId', NEW.id, 'venueName', v_venue, 'amount', NEW.amount, 'transferRef', NEW.transfer_ref));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_venue_paid() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_venue_paid ON public.venue_settlements;
CREATE TRIGGER notify_venue_paid
  AFTER INSERT ON public.venue_settlements
  FOR EACH ROW EXECUTE FUNCTION public.notify_venue_paid();
