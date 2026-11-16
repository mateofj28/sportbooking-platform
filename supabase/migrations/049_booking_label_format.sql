-- SportBooking — Texto del turno en los movimientos con el formato único de la app
-- Migración: 049_booking_label_format.sql
--
-- booking_label (043) armaba "Cancha 1 · Simulación 1 · 13/11 22:00" (24 h). La regla de
-- diseño es "13 nov 2026, 10:00 pm" (diseno.md, lib/datetime.ts). Se corrige la función y
-- se reescribe el TEXTO (detail) de los movimientos ya guardados para que queden iguales.
-- Solo cambia el texto mostrado: montos, saldos y fechas de los movimientos no se tocan.
-- ============================================================

-- Instante -> "13 nov 2026, 10:00 pm" (hora AR)
CREATE OR REPLACE FUNCTION public.fmt_ar_datetime(p_ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT extract(day FROM t)::int || ' '
         || (ARRAY['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month FROM t)::int]
         || ' ' || extract(year FROM t)::int || ', '
         || ((extract(hour FROM t)::int + 11) % 12 + 1) || ':' || to_char(t, 'MI')
         || CASE WHEN extract(hour FROM t) < 12 THEN ' am' ELSE ' pm' END
    FROM (SELECT p_ts AT TIME ZONE 'America/Argentina/Buenos_Aires' AS t) x;
$$;

-- "Cancha 1 · Simulación 1 · 13 nov 2026, 10:00 pm"
CREATE OR REPLACE FUNCTION public.booking_label(p_booking uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.name || ' · ' || v.name || ' · ' || public.fmt_ar_datetime(b.start_datetime)
    FROM public.bookings b
    JOIN public.facilities f ON f.id = b.facility_id
    JOIN public.venues v ON v.id = f.venue_id
   WHERE b.id = p_booking;
$$;
REVOKE ALL ON FUNCTION public.booking_label(uuid) FROM PUBLIC, anon, authenticated;

-- Reescribir el texto de los movimientos existentes (solo los que tienen su reserva)
UPDATE public.wallet_transactions t
   SET detail = split_part(t.detail, ' — ', 1) || ' — ' || public.booking_label(t.booking_id)
 WHERE t.kind IN ('BOOKING_PAYMENT', 'BOOKING_REFUND')
   AND t.booking_id IS NOT NULL
   AND public.booking_label(t.booking_id) IS NOT NULL;

UPDATE public.venue_ledger l
   SET detail = left('Turno jugado — ' || public.booking_label(l.booking_id)
                     || coalesce(' · ' || NULLIF(regexp_replace(btrim(p.first_name || ' ' || p.last_name), '\s+', ' ', 'g'), ''), ''), 300)
  FROM public.bookings b
  LEFT JOIN public.profiles p ON p.id = b.user_id
 WHERE l.kind = 'BOOKING_CREDIT'
   AND l.booking_id = b.id;
