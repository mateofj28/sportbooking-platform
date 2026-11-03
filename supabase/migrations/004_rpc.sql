-- ============================================================
-- SportBooking — Postgres RPC Functions
-- Migración: 004_rpc.sql
-- Lógica puramente de datos: sin llamadas externas.
-- Se invocan desde el frontend con supabase.rpc('nombre', params)
-- ============================================================

-- ============================================================
-- HELPER INTERNO: ar_midnight_utc(date_str text)
-- Convierte una fecha YYYY-MM-DD a medianoche hora Argentina
-- expresada como timestamptz UTC.
-- 00:00 hora Argentina = 03:00 UTC del mismo día.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ar_midnight_utc(date_str text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (date_str::date + interval '3 hours')::timestamptz;
$$;


-- ============================================================
-- HELPER INTERNO: ar_day_key(ts timestamptz)
-- Devuelve el día en hora Argentina (YYYY-MM-DD) para un
-- instante UTC. Se usa para agrupar ingresos por día AR.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ar_day_key(ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(ts AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD');
$$;


-- ============================================================
-- 1. calculate_price
--    Calcula base_price, commission_amount y total_price para
--    una cancha y un horario de inicio dado.
--    Busca la tarifa activa que aplica al día de semana y hora.
--    Precio por TURNO (fijo, no por hora).
--
--    Edge cases:
--    - Sin tarifa activa → error 'Sin tarifa para este horario'
--    - Cancha inactiva → error 'Cancha no disponible'
--    - Cancha no existe → error 'Cancha no encontrada'
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_facility_id   uuid,
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
  v_dow          int;      -- día de semana AR (0=Lunes..6=Domingo)
  v_start_min    int;      -- minutos desde medianoche AR para el inicio
  v_start_ar     timestamptz;
  v_base         numeric;
  v_commission   numeric;
  v_total        numeric;
BEGIN
  -- Verificar que la cancha existe y está activa
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

  -- Convertir el instante UTC a hora Argentina para obtener día y hora
  v_start_ar  := p_start_datetime AT TIME ZONE 'America/Argentina/Buenos_Aires';
  -- Día de semana AR: Postgres DOW: 0=Domingo..6=Sábado → convertir a 0=Lunes..6=Domingo
  v_dow       := ((EXTRACT(DOW FROM v_start_ar)::int + 6) % 7);
  v_start_min := EXTRACT(HOUR FROM v_start_ar)::int * 60 +
                 EXTRACT(MINUTE FROM v_start_ar)::int;

  -- Buscar tarifa activa que aplique:
  -- a) NULL day_of_week (aplica todos los días) o igual al DOW
  -- b) La franja horaria cubre el momento de inicio
  -- Si el horario cruza medianoche (end_time < start_time), se maneja con módulo
  SELECT p.* INTO v_pricing
  FROM public.pricing p
  WHERE p.facility_id = p_facility_id
    AND p.is_active = true
    AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
    AND (
      -- Caso normal: start_time <= inicio < end_time
      (
        p.start_time::time <= (v_start_ar::time) AND
        (v_start_ar::time) < p.end_time::time AND
        p.end_time::time > p.start_time::time
      )
      OR
      -- Caso que cruza medianoche: inicio >= start_time O inicio < end_time
      (
        p.end_time::time <= p.start_time::time AND
        (
          (v_start_ar::time) >= p.start_time::time OR
          (v_start_ar::time) < p.end_time::time
        )
      )
    )
  ORDER BY p.day_of_week NULLS LAST  -- preferir tarifa específica del día sobre la general
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin tarifa activa para este horario (día: %, hora: %)', v_dow, v_start_min
      USING ERRCODE = 'P0004';
  END IF;

  -- Calcular montos
  v_base       := v_pricing.price_per_hour;  -- precio fijo del turno
  v_commission := ROUND(v_base * v_pricing.profit_percent / 100, 2);
  v_total      := v_base + v_commission;

  RETURN json_build_object(
    'base_price',       v_base,
    'commission_amount', v_commission,
    'total_price',      v_total,
    'currency',         v_pricing.currency,
    'pricing_id',       v_pricing.id
  );
END;
$$;


-- ============================================================
-- 2. get_availability
--    Calcula los slots disponibles de una cancha para una fecha.
--    p_date: YYYY-MM-DD interpretado en hora Argentina.
--    Retorna array de slots con: time (HH:MM), available (bool),
--    reason ('past'|'booked'|'blocked'|null).
--
--    Edge cases:
--    - Sin schedule activo → { available: false, message: '...' }
--    - Sin tarifa → slot omitido
--    - Horario cruza medianoche → ventana de 48h en UTC
--    - Slot en el pasado → reason = 'past'
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
  v_facility     record;
  v_schedule     record;
  v_day_start    timestamptz;
  v_day_end      timestamptz;
  v_dow          int;
  v_open_min     int;
  v_close_min    int;
  v_duration     int;
  v_cur_min      int;
  v_slot_start   timestamptz;
  v_slot_end     timestamptz;
  v_slot_time    text;
  v_available    boolean;
  v_reason       text;
  v_has_pricing  boolean;
  v_slots        json[] := '{}';
  v_h            int;
  v_m            int;
  v_slot_hour    int;
  v_slot_min_in_day int;
BEGIN
  -- Ventana del día en UTC (hora AR = UTC+(-3) → medianoche AR = 03:00 UTC)
  v_day_start := public.ar_midnight_utc(p_date);
  v_day_end   := v_day_start + interval '48 hours';  -- cubre horarios que cruzan medianoche

  -- Verificar cancha
  SELECT f.*, f.min_booking_duration AS duration
  INTO v_facility
  FROM public.facilities f
  WHERE f.id = p_facility_id AND f.is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('available', false, 'slots', '[]'::json, 'message', 'Cancha no encontrada o inactiva');
  END IF;

  v_duration := v_facility.min_booking_duration;

  -- Día de semana AR (0=Lunes..6=Domingo)
  v_dow := ((EXTRACT(DOW FROM v_day_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);

  -- Buscar schedule activo para ese día
  SELECT s.* INTO v_schedule
  FROM public.schedules s
  WHERE s.facility_id = p_facility_id
    AND s.day_of_week = v_dow
    AND s.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('available', false, 'slots', '[]'::json, 'message', 'Sin horario para este día');
  END IF;

  -- Convertir open/close a minutos desde medianoche
  v_open_min  := EXTRACT(HOUR FROM v_schedule.open_time::time)::int * 60 +
                 EXTRACT(MINUTE FROM v_schedule.open_time::time)::int;
  v_close_min := EXTRACT(HOUR FROM v_schedule.close_time::time)::int * 60 +
                 EXTRACT(MINUTE FROM v_schedule.close_time::time)::int;

  -- Si cierra antes o igual que abre → cruza medianoche: añadir 24h al cierre
  IF v_close_min <= v_open_min THEN
    v_close_min := v_close_min + 24 * 60;
  END IF;

  -- Iterar slots
  v_cur_min := v_open_min;
  WHILE v_cur_min + v_duration <= v_close_min LOOP
    -- Calcular HH:MM del slot (puede ser > 24h si cruza medianoche)
    v_slot_min_in_day := v_cur_min % (24 * 60);
    v_h    := v_slot_min_in_day / 60;
    v_m    := v_slot_min_in_day % 60;
    v_slot_time := lpad(v_h::text, 2, '0') || ':' || lpad(v_m::text, 2, '0');

    -- Instantes UTC del slot
    v_slot_start := v_day_start + (v_cur_min || ' minutes')::interval;
    v_slot_end   := v_slot_start + (v_duration || ' minutes')::interval;

    -- Verificar si tiene tarifa activa para este slot
    SELECT EXISTS (
      SELECT 1 FROM public.pricing p
      WHERE p.facility_id = p_facility_id
        AND p.is_active = true
        AND (p.day_of_week IS NULL OR p.day_of_week = v_dow)
        AND (
          (p.start_time::time <= v_slot_start::time AND v_slot_start::time < p.end_time::time AND p.end_time::time > p.start_time::time)
          OR
          (p.end_time::time <= p.start_time::time AND (v_slot_start::time >= p.start_time::time OR v_slot_start::time < p.end_time::time))
        )
    ) INTO v_has_pricing;

    -- Omitir slots sin tarifa
    IF NOT v_has_pricing THEN
      v_cur_min := v_cur_min + v_duration;
      CONTINUE;
    END IF;

    -- Determinar disponibilidad
    v_reason := null;

    -- ¿Pasado?
    IF v_slot_start <= now() THEN
      v_available := false;
      v_reason    := 'past';

    -- ¿Reservado?
    ELSIF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.facility_id = p_facility_id
        AND b.status = 'CONFIRMED'
        AND b.start_datetime < v_slot_end
        AND b.end_datetime > v_slot_start
    ) THEN
      v_available := false;
      v_reason    := 'booked';

    -- ¿Bloqueado?
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
--    Versión batch: disponibilidad de muchas canchas en 3 queries.
--    No N+1: carga todas las reservas y bloqueos de una vez.
--    p_date: YYYY-MM-DD en hora AR.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_availability_summary(
  p_venue_id  uuid    DEFAULT NULL,
  p_sport_id  uuid    DEFAULT NULL,
  p_date      text    DEFAULT NULL   -- YYYY-MM-DD en hora AR
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date      text;
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_dow       int;
  v_result    json[] := '{}';
  v_facility  record;
  v_schedule  record;
  v_open_min  int;
  v_close_min int;
  v_duration  int;
  v_cur_min   int;
  v_slot_start timestamptz;
  v_slot_end   timestamptz;
  v_total_slots int;
  v_free_slots  int;
  v_free_times  text[] := '{}';
  v_slot_min_in_day int;
  v_h         int;
  v_m         int;
  v_slot_time text;
  v_is_free   boolean;
BEGIN
  v_date      := COALESCE(p_date, to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'));
  v_day_start := public.ar_midnight_utc(v_date);
  v_day_end   := v_day_start + interval '48 hours';
  v_dow       := ((EXTRACT(DOW FROM v_day_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);

  -- Iterar sobre las canchas activas (filtradas por venue y/o sport)
  FOR v_facility IN
    SELECT f.*
    FROM public.facilities f
    WHERE f.is_active = true
      AND (p_venue_id IS NULL OR f.venue_id = p_venue_id)
      AND (p_sport_id IS NULL OR f.sport_id = p_sport_id)
  LOOP
    v_duration := v_facility.min_booking_duration;
    v_free_slots := 0;
    v_total_slots := 0;
    v_free_times := '{}';

    -- Buscar schedule para este día
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

    -- Recorrer slots
    v_cur_min := v_open_min;
    WHILE v_cur_min + v_duration <= v_close_min LOOP
      v_slot_min_in_day := v_cur_min % (24 * 60);
      v_h    := v_slot_min_in_day / 60;
      v_m    := v_slot_min_in_day % 60;
      v_slot_time  := lpad(v_h::text, 2, '0') || ':' || lpad(v_m::text, 2, '0');
      v_slot_start := v_day_start + (v_cur_min || ' minutes')::interval;
      v_slot_end   := v_slot_start + (v_duration || ' minutes')::interval;

      -- Omitir pasados
      IF v_slot_start <= now() THEN
        v_cur_min := v_cur_min + v_duration;
        CONTINUE;
      END IF;

      v_total_slots := v_total_slots + 1;

      -- Verificar disponibilidad
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


-- ============================================================
-- 4. get_stats
--    Estadísticas agregadas con scope automático por rol.
--    VENUE_ADMIN ve solo su sede. ADMIN ve todo.
--    Rangos cortados a medianoche hora Argentina.
--    Ingresos reconocidos por día de FIN del turno.
--
--    Parámetros:
--    p_range:    'today'|'yesterday'|'week'|'month'|'all'|'custom'
--    p_from:     YYYY-MM-DD (solo si p_range = 'custom')
--    p_to:       YYYY-MM-DD (solo si p_range = 'custom')
--    p_sport_id: uuid opcional
--    p_venue_id: uuid opcional (solo para ADMIN; VENUE_ADMIN ignora esto)
--    p_status:   'ALL'|'CONFIRMED'|'COMPLETED'|'CANCELLED' opcional
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_stats(
  p_range    text    DEFAULT 'month',
  p_from     text    DEFAULT NULL,
  p_to       text    DEFAULT NULL,
  p_sport_id uuid    DEFAULT NULL,
  p_venue_id uuid    DEFAULT NULL,
  p_status   text    DEFAULT 'ALL'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now           timestamptz := now();
  v_today_ar      text        := to_char(v_now AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD');
  v_start         timestamptz;
  v_end           timestamptz;
  v_venue_id      uuid;
  v_my_venue_id   uuid;
  v_my_role       text;
  -- contadores
  v_total         int := 0;
  v_confirmed     int := 0;
  v_completed     int := 0;
  v_cancelled     int := 0;
  v_pending       int := 0;
  v_total_revenue numeric := 0;
  v_total_commission numeric := 0;
  v_total_base    numeric := 0;
  -- acumuladores json
  v_by_status     jsonb := '{"PENDING":0,"CONFIRMED":0,"CANCELLED":0,"COMPLETED":0}'::jsonb;
  v_by_day        jsonb := '{}'::jsonb;
  v_by_weekday    int[] := ARRAY[0,0,0,0,0,0,0];  -- 0=Lun..6=Dom
  v_by_sport      jsonb := '{}'::jsonb;
  v_by_venue      jsonb := '{}'::jsonb;
  v_client_ids    uuid[] := '{}';
  v_recent        jsonb := '[]'::jsonb;
  v_recent_seen   uuid[] := '{}';
  -- por booking
  v_booking       record;
  v_in_by_start   boolean;
  v_in_by_end     boolean;
  v_earned        boolean;
  v_total_p       numeric;
  v_commission    numeric;
  v_base          numeric;
  v_sport_key     text;
  v_venue_key     text;
  v_dow           int;
  v_day_key       text;
  v_sport_entry   jsonb;
  v_venue_entry   jsonb;
  v_total_all     int;
  v_total_active  int;
  v_occupancy     int;
  v_avg_price     numeric;
BEGIN
  -- Determinar scope por rol
  v_my_role     := public.get_my_role();
  v_my_venue_id := public.get_my_venue_id();

  IF v_my_role = 'VENUE_ADMIN' THEN
    v_venue_id := v_my_venue_id;  -- forzar su sede, ignora p_venue_id
  ELSE
    v_venue_id := p_venue_id;     -- ADMIN puede filtrar por cualquier sede o ver todo
  END IF;

  -- Calcular rango de fechas en hora Argentina (medianoche AR = 03:00 UTC)
  CASE p_range
    WHEN 'today' THEN
      v_start := public.ar_midnight_utc(v_today_ar);
      v_end   := v_start + interval '1 day';
    WHEN 'yesterday' THEN
      v_start := public.ar_midnight_utc(v_today_ar) - interval '1 day';
      v_end   := public.ar_midnight_utc(v_today_ar);
    WHEN 'week' THEN
      v_start := v_now - interval '7 days';
      v_end   := v_now;
    WHEN 'month' THEN
      v_start := v_now - interval '30 days';
      v_end   := v_now;
    WHEN 'custom' THEN
      IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'p_from y p_to son requeridos para rango custom';
      END IF;
      v_start := public.ar_midnight_utc(p_from);
      v_end   := public.ar_midnight_utc(p_to) + interval '1 day';  -- inclusivo
    WHEN 'all' THEN
      v_start := NULL;
      v_end   := NULL;
    ELSE
      v_start := v_now - interval '30 days';
      v_end   := v_now;
  END CASE;

  -- Iterar sobre bookings del scope
  FOR v_booking IN
    SELECT
      b.id, b.status, b.payment_status,
      b.start_datetime, b.end_datetime,
      b.total_price, b.base_price, b.commission_amount,
      b.user_id,
      f.sport_id,
      f.venue_id AS fac_venue_id,
      sp.name AS sport_name,
      v.name AS venue_name,
      p.first_name, p.last_name
    FROM public.bookings b
    JOIN public.facilities f ON f.id = b.facility_id
    JOIN public.sports sp    ON sp.id = f.sport_id
    JOIN public.venues v     ON v.id = f.venue_id
    JOIN public.profiles p   ON p.id = b.user_id
    WHERE
      -- Scope por sede
      (v_venue_id IS NULL OR f.venue_id = v_venue_id)
      -- Scope por deporte
      AND (p_sport_id IS NULL OR f.sport_id = p_sport_id)
      -- Scope por estado
      AND (p_status = 'ALL' OR p_status IS NULL OR b.status::text = p_status)
      -- Rango: traer si start O end cae en el período
      AND (
        v_start IS NULL OR (
          (b.start_datetime >= v_start AND (v_end IS NULL OR b.start_datetime < v_end))
          OR
          (b.end_datetime >= v_start AND (v_end IS NULL OR b.end_datetime < v_end))
        )
      )
  LOOP
    -- ¿Inicio cae en el rango?
    v_in_by_start := (v_start IS NULL OR b.start_datetime >= v_start)
                 AND (v_end   IS NULL OR b.start_datetime < v_end);
    -- ¿Fin cae en el rango?
    v_in_by_end   := (v_start IS NULL OR v_booking.end_datetime >= v_start)
                 AND (v_end   IS NULL OR v_booking.end_datetime < v_end);

    -- ¿Turno "ganado"? = pagado, ya terminó y su FIN cae en el período
    v_earned := v_in_by_end
             AND v_booking.payment_status = 'PAID'
             AND v_booking.end_datetime <= v_now;

    v_total_p  := COALESCE(v_booking.total_price, 0);
    v_commission := COALESCE(v_booking.commission_amount, 0);
    v_base     := COALESCE(v_booking.base_price, v_total_p - v_commission);

    -- ACTIVIDAD: contar por día de INICIO
    IF v_in_by_start THEN
      v_by_status := jsonb_set(
        v_by_status,
        ARRAY[v_booking.status::text],
        to_jsonb(COALESCE((v_by_status->>v_booking.status::text)::int, 0) + 1)
      );

      IF v_booking.status = 'CANCELLED' THEN
        v_cancelled := v_cancelled + 1;
      ELSE
        v_total := v_total + 1;
        IF v_booking.status = 'CONFIRMED' THEN v_confirmed := v_confirmed + 1;
        ELSIF v_booking.status = 'COMPLETED' THEN v_completed := v_completed + 1;
        ELSIF v_booking.status = 'PENDING'   THEN v_pending := v_pending + 1;
        END IF;
      END IF;

      -- Por día de semana (actividad, por inicio, en hora AR)
      -- 0=Lunes..6=Domingo (ajustar DOW de Postgres que es 0=Domingo)
      v_dow := ((EXTRACT(DOW FROM v_booking.start_datetime AT TIME ZONE 'America/Argentina/Buenos_Aires')::int + 6) % 7);
      v_by_weekday[v_dow + 1] := v_by_weekday[v_dow + 1] + 1;

      -- Por deporte (count por inicio)
      v_sport_key  := v_booking.sport_id::text;
      v_sport_entry := COALESCE(v_by_sport->v_sport_key, json_build_object('sport_id', v_booking.sport_id, 'name', v_booking.sport_name, 'count', 0, 'revenue', 0)::jsonb);
      v_by_sport := jsonb_set(v_by_sport, ARRAY[v_sport_key],
        jsonb_set(v_sport_entry, '{count}', to_jsonb((v_sport_entry->>'count')::int + 1))
      );

      -- Por venue (count por inicio)
      v_venue_key  := v_booking.fac_venue_id::text;
      v_venue_entry := COALESCE(v_by_venue->v_venue_key, json_build_object('venue_id', v_booking.fac_venue_id, 'venue_name', v_booking.venue_name, 'total', 0, 'base', 0, 'commission', 0, 'count', 0)::jsonb);
      v_by_venue := jsonb_set(v_by_venue, ARRAY[v_venue_key],
        jsonb_set(v_venue_entry, '{count}', to_jsonb((v_venue_entry->>'count')::int + 1))
      );

      -- Clientes únicos y recientes
      IF NOT (v_booking.user_id = ANY(v_client_ids)) THEN
        v_client_ids := v_client_ids || v_booking.user_id;
      END IF;
      IF array_length(v_recent, 1) IS NULL OR array_length(v_recent, 1) < 5 THEN
        IF NOT (v_booking.user_id = ANY(v_recent_seen)) THEN
          v_recent_seen := v_recent_seen || v_booking.user_id;
          v_recent := v_recent || jsonb_build_object(
            'id',         v_booking.user_id,
            'first_name', v_booking.first_name,
            'last_name',  v_booking.last_name
          );
        END IF;
      END IF;
    END IF;

    -- DINERO: solo turnos "ganados" (por FIN del turno)
    IF v_earned THEN
      v_total_revenue    := v_total_revenue    + v_total_p;
      v_total_commission := v_total_commission + v_commission;
      v_total_base       := v_total_base       + v_base;

      -- Por día AR del FIN del turno
      v_day_key := public.ar_day_key(v_booking.end_datetime);
      v_by_day := jsonb_set(
        v_by_day,
        ARRAY[v_day_key],
        to_jsonb(COALESCE((v_by_day->>v_day_key)::numeric, 0) + v_total_p)
      );

      -- Revenue por deporte (por fin ganado)
      v_sport_key  := v_booking.sport_id::text;
      v_sport_entry := COALESCE(v_by_sport->v_sport_key, json_build_object('sport_id', v_booking.sport_id, 'name', v_booking.sport_name, 'count', 0, 'revenue', 0)::jsonb);
      v_by_sport := jsonb_set(v_by_sport, ARRAY[v_sport_key],
        jsonb_set(v_sport_entry, '{revenue}', to_jsonb((v_sport_entry->>'revenue')::numeric + v_total_p))
      );

      -- Montos por venue (por fin ganado)
      v_venue_key  := v_booking.fac_venue_id::text;
      v_venue_entry := COALESCE(v_by_venue->v_venue_key, json_build_object('venue_id', v_booking.fac_venue_id, 'venue_name', v_booking.venue_name, 'total', 0, 'base', 0, 'commission', 0, 'count', 0)::jsonb);
      v_by_venue := jsonb_set(v_by_venue, ARRAY[v_venue_key],
        v_venue_entry
        || jsonb_build_object(
             'total',      (v_venue_entry->>'total')::numeric + v_total_p,
             'base',       (v_venue_entry->>'base')::numeric + v_base,
             'commission', (v_venue_entry->>'commission')::numeric + v_commission
           )
      );
    END IF;
  END LOOP;

  -- Calcular métricas derivadas
  v_total_all    := v_total + v_cancelled;
  v_total_active := v_total;  -- total ya excluye cancelados
  v_occupancy    := CASE WHEN v_total_all > 0 THEN ROUND((v_total_active::numeric / v_total_all) * 100)::int ELSE 0 END;
  v_avg_price    := CASE WHEN v_total_active > 0 THEN ROUND(v_total_base / v_total_active, 2) ELSE 0 END;

  RETURN json_build_object(
    'totals', json_build_object(
      'total',            v_total,
      'totalAll',         v_total_all,
      'confirmed',        v_confirmed,
      'cancelled',        v_cancelled,
      'completed',        v_completed,
      'pending',          v_pending,
      'totalRevenue',     v_total_revenue,
      'totalCommission',  v_total_commission,
      'totalBase',        v_total_base,
      'occupancyRate',    v_occupancy,
      'avgPrice',         v_avg_price,
      'uniqueClients',    array_length(v_client_ids, 1)
    ),
    'byStatus',   v_by_status,
    'byWeekday',  v_by_weekday,
    'byDay', (
      SELECT json_agg(json_build_object('date', key, 'revenue', value::numeric) ORDER BY key)
      FROM jsonb_each_text(v_by_day)
    ),
    'bySport', (
      SELECT json_agg(value ORDER BY (value->>'count')::int DESC)
      FROM jsonb_each(v_by_sport)
      WHERE (value->>'count')::int > 0 OR (value->>'revenue')::numeric > 0
    ),
    'byVenue', (
      SELECT json_agg(value ORDER BY (value->>'base')::numeric DESC)
      FROM jsonb_each(v_by_venue)
      WHERE (value->>'count')::int > 0 OR (value->>'base')::numeric > 0
    ),
    'recentClients', v_recent
  );
END;
$$;
