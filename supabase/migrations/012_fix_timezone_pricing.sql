-- ============================================================
-- 012_fix_timezone_pricing.sql
-- Fix: turnos de madrugada (ej. horario 12:00 -> 02:00) no aparecían
-- y no se podían reservar.
--
-- Causa: se comparaba la hora de la tarifa contra la hora UTC.
--  * get_availability / get_availability_summary hacían
--    `v_slot_start::time` sobre un timestamptz -> usa la zona de la
--    sesión (UTC en Supabase), no la de Argentina. Los turnos de
--    23:00, 00:00 y 01:00 AR (02:00, 03:00, 04:00 UTC) quedaban
--    fuera de la franja 12:00-02:00 y se omitían.
--  * calculate_price guardaba la hora AR en una variable timestamptz,
--    lo que la reconvertía a UTC: fallaba "Sin tarifa" a partir de
--    las 23:00 y calculaba mal el día de semana desde las 21:00.
--
-- Solución: obtener la hora local del turno directamente desde los
-- minutos del día (v_cur_min) y usar timestamp SIN zona horaria para
-- la hora AR en calculate_price.
-- ============================================================


-- ============================================================
-- 1. calculate_price
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_price(
  p_facility_id    uuid,
  p_start_datetime timestamptz
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facility     record;
  v_pricing      record;
  v_dow          int;       -- día de semana AR (0=Lunes..6=Domingo)
  v_start_min    int;       -- minutos desde medianoche AR para el inicio
  v_start_ar     timestamp; -- hora local AR SIN zona (fix: antes era timestamptz)
  v_start_time   time;
  v_base         numeric;
  v_commission   numeric;
  v_total        numeric;
BEGIN
  SELECT id, is_active INTO v_facility
  FROM public.facilities
  WHERE id = p_facility_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancha no encontrada: %', p_facility_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_facility.is_active THEN
    RAISE EXCEPTION 'Cancha no disponible (inactiva)'
      USING ERRCODE = 'P0003';
  END IF;

  -- Instante UTC -> hora local de Argentina (timestamp sin zona)
  v_start_ar   := p_start_datetime AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_start_time := v_start_ar::time;
  v_dow        := ((EXTRACT(DOW FROM v_start_ar)::int + 6) % 7);
  v_start_min  := EXTRACT(HOUR FROM v_start_ar)::int * 60 +
                  EXTRACT(MINUTE FROM v_start_ar)::int;

  SELECT p.* INTO v_pricing
  FROM public.pricing p
  WHERE p.facility_id = p_facility_id
    AND p.is_active = true
    AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
    AND (
      -- Franja normal: start <= inicio < end
      (
        p.end_time::time > p.start_time::time AND
        p.start_time::time <= v_start_time AND
        v_start_time < p.end_time::time
      )
      OR
      -- Franja que cruza medianoche: inicio >= start O inicio < end
      (
        p.end_time::time <= p.start_time::time AND
        (v_start_time >= p.start_time::time OR v_start_time < p.end_time::time)
      )
    )
  ORDER BY p.day_of_week NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin tarifa activa para este horario (día: %, hora: %)', v_dow, v_start_min
      USING ERRCODE = 'P0004';
  END IF;

  v_base       := v_pricing.price_per_hour;
  v_commission := ROUND(v_base * v_pricing.profit_percent / 100, 2);
  v_total      := v_base + v_commission;

  RETURN json_build_object(
    'base_price',        v_base,
    'commission_amount', v_commission,
    'total_price',       v_total,
    'currency',          v_pricing.currency,
    'pricing_id',        v_pricing.id
  );
END;
$$;


-- ============================================================
-- 2. get_availability
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_availability(
  p_facility_id uuid,
  p_date        text   -- YYYY-MM-DD en hora AR
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facility        record;
  v_schedule        record;
  v_day_start       timestamptz;
  v_dow             int;
  v_open_min        int;
  v_close_min       int;
  v_duration        int;
  v_cur_min         int;
  v_slot_start      timestamptz;
  v_slot_end        timestamptz;
  v_slot_time       text;
  v_slot_local      time;     -- hora local AR del turno (fix)
  v_available       boolean;
  v_reason          text;
  v_has_pricing     boolean;
  v_slots           json[] := '{}';
  v_h               int;
  v_m               int;
  v_slot_min_in_day int;
BEGIN
  -- 00:00 hora AR expresada en UTC
  v_day_start := public.ar_midnight_utc(p_date);

  SELECT f.*, f.min_booking_duration AS duration
  INTO v_facility
  FROM public.facilities f
  WHERE f.id = p_facility_id AND f.is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('available', false, 'slots', '[]'::json, 'message', 'Cancha no encontrada o inactiva');
  END IF;

  v_duration := v_facility.min_booking_duration;

  v_dow := ((EXTRACT(DOW FROM v_day_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);

  SELECT s.* INTO v_schedule
  FROM public.schedules s
  WHERE s.facility_id = p_facility_id
    AND s.day_of_week = v_dow
    AND s.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('available', false, 'slots', '[]'::json, 'message', 'Sin horario para este día');
  END IF;

  v_open_min  := EXTRACT(HOUR FROM v_schedule.open_time::time)::int * 60 +
                 EXTRACT(MINUTE FROM v_schedule.open_time::time)::int;
  v_close_min := EXTRACT(HOUR FROM v_schedule.close_time::time)::int * 60 +
                 EXTRACT(MINUTE FROM v_schedule.close_time::time)::int;

  -- Cierra antes o igual que abre -> cruza medianoche
  IF v_close_min <= v_open_min THEN
    v_close_min := v_close_min + 24 * 60;
  END IF;

  v_cur_min := v_open_min;
  WHILE v_cur_min + v_duration <= v_close_min LOOP
    v_slot_min_in_day := v_cur_min % (24 * 60);
    v_h := v_slot_min_in_day / 60;
    v_m := v_slot_min_in_day % 60;
    v_slot_time := lpad(v_h::text, 2, '0') || ':' || lpad(v_m::text, 2, '0');

    -- Hora local AR del turno, derivada de los minutos del día
    -- (NO de v_slot_start::time, que usaría UTC)
    v_slot_local := (v_slot_min_in_day * interval '1 minute')::time;

    v_slot_start := v_day_start + (v_cur_min || ' minutes')::interval;
    v_slot_end   := v_slot_start + (v_duration || ' minutes')::interval;

    SELECT EXISTS (
      SELECT 1 FROM public.pricing p
      WHERE p.facility_id = p_facility_id
        AND p.is_active = true
        AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
        AND (
          (
            p.end_time::time > p.start_time::time AND
            p.start_time::time <= v_slot_local AND
            v_slot_local < p.end_time::time
          )
          OR
          (
            p.end_time::time <= p.start_time::time AND
            (v_slot_local >= p.start_time::time OR v_slot_local < p.end_time::time)
          )
        )
    ) INTO v_has_pricing;

    -- Sin tarifa: el turno se omite
    IF NOT v_has_pricing THEN
      v_cur_min := v_cur_min + v_duration;
      CONTINUE;
    END IF;

    v_reason := null;

    IF v_slot_start <= now() THEN
      v_available := false;
      v_reason    := 'past';

    ELSIF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.facility_id = p_facility_id
        AND b.status = 'CONFIRMED'
        AND b.start_datetime < v_slot_end
        AND b.end_datetime > v_slot_start
    ) THEN
      v_available := false;
      v_reason    := 'booked';

    ELSIF EXISTS (
      SELECT 1 FROM public.blocked_slots bs
      WHERE bs.facility_id = p_facility_id
        AND bs.start_datetime < v_slot_end
        AND bs.end_datetime > v_slot_start
    ) THEN
      v_available := false;
      v_reason    := 'blocked';

    ELSE
      v_available := true;
    END IF;

    v_slots := v_slots || json_build_object(
      'time',      v_slot_time,
      'available', v_available,
      'reason',    v_reason
    );

    v_cur_min := v_cur_min + v_duration;
  END LOOP;

  RETURN json_build_object(
    'available', true,
    'slots',     array_to_json(v_slots)
  );
END;
$$;


-- ============================================================
-- 3. get_availability_summary
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
  v_date            text;
  v_day_start       timestamptz;
  v_dow             int;
  v_result          json[] := '{}';
  v_facility        record;
  v_schedule        record;
  v_open_min        int;
  v_close_min       int;
  v_duration        int;
  v_cur_min         int;
  v_slot_start      timestamptz;
  v_slot_end        timestamptz;
  v_total_slots     int;
  v_free_slots      int;
  v_free_times      text[] := '{}';
  v_slot_min_in_day int;
  v_h               int;
  v_m               int;
  v_slot_time       text;
  v_slot_local      time;     -- hora local AR del turno (fix)
  v_is_free         boolean;
  v_has_pricing     boolean;
BEGIN
  v_date      := COALESCE(p_date, to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'));
  v_day_start := public.ar_midnight_utc(v_date);
  v_dow       := ((EXTRACT(DOW FROM v_day_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);

  FOR v_facility IN
    SELECT f.*
    FROM public.facilities f
    WHERE f.is_active = true
      AND (p_venue_id IS NULL OR f.venue_id = p_venue_id)
      AND (p_sport_id IS NULL OR f.sport_id = p_sport_id)
      AND public.is_facility_bookable(f.id) = true
  LOOP
    v_duration    := v_facility.min_booking_duration;
    v_free_slots  := 0;
    v_total_slots := 0;
    v_free_times  := '{}';

    SELECT s.* INTO v_schedule
    FROM public.schedules s
    WHERE s.facility_id = v_facility.id
      AND s.day_of_week = v_dow
      AND s.is_active = true
    LIMIT 1;

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

    v_cur_min := v_open_min;
    WHILE v_cur_min + v_duration <= v_close_min LOOP
      v_slot_min_in_day := v_cur_min % (24 * 60);
      v_h               := v_slot_min_in_day / 60;
      v_m               := v_slot_min_in_day % 60;
      v_slot_time       := lpad(v_h::text, 2, '0') || ':' || lpad(v_m::text, 2, '0');
      v_slot_local      := (v_slot_min_in_day * interval '1 minute')::time;
      v_slot_start      := v_day_start + (v_cur_min || ' minutes')::interval;
      v_slot_end        := v_slot_start + (v_duration || ' minutes')::interval;

      -- Omitir pasados
      IF v_slot_start <= now() THEN
        v_cur_min := v_cur_min + v_duration;
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.pricing p
        WHERE p.facility_id = v_facility.id
          AND p.is_active = true
          AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
          AND (
            (
              p.end_time::time > p.start_time::time AND
              p.start_time::time <= v_slot_local AND
              v_slot_local < p.end_time::time
            )
            OR
            (
              p.end_time::time <= p.start_time::time AND
              (v_slot_local >= p.start_time::time OR v_slot_local < p.end_time::time)
            )
          )
      ) INTO v_has_pricing;

      IF NOT v_has_pricing THEN
        v_cur_min := v_cur_min + v_duration;
        CONTINUE;
      END IF;

      v_total_slots := v_total_slots + 1;

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
