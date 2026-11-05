-- ============================================================
-- 009_bookable_facilities.sql
-- Fix: visibilidad y disponibilidad de canchas para el cliente.
--
-- Problemas corregidos:
-- 1. Nueva función is_facility_bookable() — determina si una
--    cancha está lista para reservar (has_schedule AND has_pricing).
--    Corre en la DB, sin round-trips extra desde el cliente.
--
-- 2. get_availability_summary actualizada — filtra canchas sin
--    pricing al contar slots libres (igual que get_availability).
--    Antes: reportaba slots "libres" en canchas sin tarifa.
--    Ahora: los slots sin tarifa se omiten del conteo.
--
-- 3. get_availability_summary: canchas sin schedule Y sin pricing
--    son excluidas del resultado (no aparecen con has_free_slots=false,
--    simplemente no están — el frontend no las muestra).
-- ============================================================


-- ============================================================
-- 1. is_facility_bookable(p_facility_id)
--    Devuelve true si la cancha tiene AL MENOS UN schedule activo
--    Y AL MENOS UNA tarifa activa que cubra ese schedule.
--
--    Regla de negocio:
--    - Sin schedules activos → no bookeable.
--    - Con schedules pero sin pricing activo que cubra al menos
--      un slot del horario → no bookeable.
--    - Con schedules Y pricing → bookeable.
--
--    Uso desde frontend:
--      supabase.rpc('is_facility_bookable', { p_facility_id: id })
--    Uso interno en get_availability_summary para filtrar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_facility_bookable(p_facility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Tiene al menos un schedule activo
    EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.facility_id = p_facility_id
        AND s.is_active = true
    )
    AND
    -- Tiene al menos una tarifa activa
    EXISTS (
      SELECT 1 FROM public.pricing p
      WHERE p.facility_id = p_facility_id
        AND p.is_active = true
    );
$$;


-- ============================================================
-- 2. get_availability_summary — versión corregida
--    Cambios respecto a la versión anterior:
--    a) Excluye canchas que NO son bookeable (sin schedule ni pricing)
--       del resultado — no aparecen en el listado del cliente.
--    b) Verifica pricing por slot (igual que get_availability):
--       los slots sin tarifa activa se omiten del conteo de libres.
--    c) Cuando una cancha tiene schedule pero ningún slot con tarifa,
--       se reporta has_free_slots=false con message apropiado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_availability_summary(
  p_venue_id  uuid    DEFAULT NULL,
  p_sport_id  uuid    DEFAULT NULL,
  p_date      text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date        text;
  v_day_start   timestamptz;
  v_day_end     timestamptz;
  v_dow         int;
  v_result      json[] := '{}';
  v_facility    record;
  v_schedule    record;
  v_open_min    int;
  v_close_min   int;
  v_duration    int;
  v_cur_min     int;
  v_slot_start  timestamptz;
  v_slot_end    timestamptz;
  v_total_slots int;
  v_free_slots  int;
  v_free_times  text[] := '{}';
  v_slot_min_in_day int;
  v_h           int;
  v_m           int;
  v_slot_time   text;
  v_is_free     boolean;
  v_has_pricing boolean;
BEGIN
  v_date      := COALESCE(p_date, to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'));
  v_day_start := public.ar_midnight_utc(v_date);
  v_day_end   := v_day_start + interval '48 hours';
  v_dow       := ((EXTRACT(DOW FROM v_day_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);

  -- Iterar SOLO sobre canchas bookeable (con schedule Y pricing activos).
  -- Fix 2: excluir canchas sin configuración completa desde la consulta base.
  FOR v_facility IN
    SELECT f.*
    FROM public.facilities f
    WHERE f.is_active = true
      AND (p_venue_id IS NULL OR f.venue_id = p_venue_id)
      AND (p_sport_id IS NULL OR f.sport_id = p_sport_id)
      AND public.is_facility_bookable(f.id) = true  -- ← Fix: solo canchas bookeable
  LOOP
    v_duration    := v_facility.min_booking_duration;
    v_free_slots  := 0;
    v_total_slots := 0;
    v_free_times  := '{}';

    -- Buscar schedule activo para este día de semana
    SELECT s.* INTO v_schedule
    FROM public.schedules s
    WHERE s.facility_id = v_facility.id
      AND s.day_of_week = v_dow
      AND s.is_active = true
    LIMIT 1;

    -- Sin horario para este día: informar sin descartarla del resultado
    -- (la cancha SÍ está configurada, solo no tiene horario este día concreto)
    IF NOT FOUND THEN
      v_result := v_result || json_build_object(
        'facility_id',    v_facility.id,
        'available',      false,
        'has_free_slots', false,
        'free_count',     0,
        'total_slots',    0,
        'free_slots',     '[]'::json,
        'message',        'Sin horario para este día'
      );
      CONTINUE;
    END IF;

    v_open_min  := EXTRACT(HOUR FROM v_schedule.open_time::time)::int * 60 +
                   EXTRACT(MINUTE FROM v_schedule.open_time::time)::int;
    v_close_min := EXTRACT(HOUR FROM v_schedule.close_time::time)::int * 60 +
                   EXTRACT(MINUTE FROM v_schedule.close_time::time)::int;

    IF v_close_min <= v_open_min THEN
      v_close_min := v_close_min + 24 * 60;
    END IF;

    -- Recorrer slots y verificar pricing (Fix 3)
    v_cur_min := v_open_min;
    WHILE v_cur_min + v_duration <= v_close_min LOOP
      v_slot_min_in_day := v_cur_min % (24 * 60);
      v_h               := v_slot_min_in_day / 60;
      v_m               := v_slot_min_in_day % 60;
      v_slot_time       := lpad(v_h::text, 2, '0') || ':' || lpad(v_m::text, 2, '0');
      v_slot_start      := v_day_start + (v_cur_min || ' minutes')::interval;
      v_slot_end        := v_slot_start + (v_duration || ' minutes')::interval;

      -- Omitir slots pasados (igual que antes)
      IF v_slot_start <= now() THEN
        v_cur_min := v_cur_min + v_duration;
        CONTINUE;
      END IF;

      -- Fix 3: verificar que el slot tiene tarifa activa (igual que get_availability)
      SELECT EXISTS (
        SELECT 1 FROM public.pricing p
        WHERE p.facility_id = v_facility.id
          AND p.is_active = true
          AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
          AND (
            (p.start_time::time <= v_slot_start::time
             AND v_slot_start::time < p.end_time::time
             AND p.end_time::time > p.start_time::time)
            OR
            (p.end_time::time <= p.start_time::time AND
              (v_slot_start::time >= p.start_time::time
               OR v_slot_start::time < p.end_time::time))
          )
      ) INTO v_has_pricing;

      -- Omitir slots sin tarifa (no se cuentan como disponibles ni ocupados)
      IF NOT v_has_pricing THEN
        v_cur_min := v_cur_min + v_duration;
        CONTINUE;
      END IF;

      v_total_slots := v_total_slots + 1;

      -- Verificar disponibilidad: no reservado y no bloqueado
      v_is_free := NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.facility_id = v_facility.id
          AND b.status = 'CONFIRMED'
          AND b.start_datetime < v_slot_end
          AND b.end_datetime > v_slot_start
      ) AND NOT EXISTS (
        SELECT 1 FROM public.blocked_slots bs
        WHERE bs.facility_id = v_facility.id
          AND bs.start_datetime < v_slot_end
          AND bs.end_datetime > v_slot_start
      );

      IF v_is_free THEN
        v_free_slots := v_free_slots + 1;
        v_free_times := v_free_times || v_slot_time;
      END IF;

      v_cur_min := v_cur_min + v_duration;
    END LOOP;

    v_result := v_result || json_build_object(
      'facility_id',    v_facility.id,
      'available',      true,
      'has_free_slots', v_free_slots > 0,
      'free_count',     v_free_slots,
      'total_slots',    v_total_slots,
      'free_slots',     array_to_json(v_free_times)
    );
  END LOOP;

  RETURN array_to_json(v_result);
END;
$$;
