-- SportBooking — Estadísticas del admin de sede sin la comisión de la empresa
-- Migración: 037_stats_venue_admin_base_only.sql
--
-- Regla (negocio.md): la ganancia del complejo es el precio BASE; la comisión de la
-- empresa se muestra solo al admin general.
-- Problema: get_stats armaba los gráficos de ingresos (byDay, bySport) con el TOTAL
-- cobrado (base + comisión), también para el admin de sede: no coincidían con su tarjeta
-- "Ingresos" (base) y la respuesta incluía la comisión (totalCommission, byVenue), que la
-- pantalla ocultaba pero viajaba igual.
-- Ahora, para el admin de sede todo el dinero es el precio base y la comisión vale 0.
-- El admin general no cambia. El resto de la función es idéntico a 036.
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

  -- AUTORIZACIÓN. La función es SECURITY DEFINER (salta RLS), así que el control
  -- de acceso tiene que hacerse acá adentro:
  --   * solo ADMIN y VENUE_ADMIN; cualquier otro rol (CLIENT, sin sesión, sin perfil) se rechaza
  --   * un VENUE_ADMIN sin sede asignada se rechaza (si no, v_venue_id sería NULL = "ver todo")
  IF v_my_role NOT IN ('ADMIN', 'VENUE_ADMIN') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_my_role = 'VENUE_ADMIN' AND v_my_venue_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: el administrador de sede no tiene sede asignada' USING ERRCODE = '42501';
  END IF;

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
    WHEN 'week' THEN   -- hoy y los 6 días anteriores, de medianoche a medianoche AR (036)
      v_start := public.ar_midnight_utc(v_today_ar) - interval '6 days';
      v_end   := public.ar_midnight_utc(v_today_ar) + interval '1 day';
    WHEN 'month' THEN  -- hoy y los 29 días anteriores, de medianoche a medianoche AR (036)
      v_start := public.ar_midnight_utc(v_today_ar) - interval '29 days';
      v_end   := public.ar_midnight_utc(v_today_ar) + interval '1 day';
    WHEN 'custom' THEN
      IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'p_from y p_to son requeridos para rango custom';
      END IF;
      v_start := public.ar_midnight_utc(p_from);
      v_end   := public.ar_midnight_utc(p_to) + interval '1 day';  -- inclusivo
    WHEN 'all' THEN
      v_start := NULL;
      v_end   := NULL;
    ELSE               -- por defecto, igual que 'month'
      v_start := public.ar_midnight_utc(v_today_ar) - interval '29 days';
      v_end   := public.ar_midnight_utc(v_today_ar) + interval '1 day';
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
          (b.end_datetime > v_start AND (v_end IS NULL OR b.end_datetime <= v_end))
        )
      )
  LOOP
    -- ¿Inicio cae en el rango?
    v_in_by_start := (v_start IS NULL OR v_booking.start_datetime >= v_start)
                 AND (v_end   IS NULL OR v_booking.start_datetime < v_end);
    -- ¿Fin cae en el rango?
    -- (036) El fin cuenta en el día en que se jugó: un turno que termina justo a las 00:00
    -- pertenece al día anterior. Intervalo (inicio, fin] en lugar de [inicio, fin).
    v_in_by_end   := (v_start IS NULL OR v_booking.end_datetime > v_start)
                 AND (v_end   IS NULL OR v_booking.end_datetime <= v_end);

    -- ¿Turno "ganado"? = pagado, ya terminó y su FIN cae en el período
    v_earned := v_in_by_end
             AND v_booking.payment_status = 'PAID'
             AND v_booking.end_datetime <= v_now;

    v_total_p  := COALESCE(v_booking.total_price, 0);
    v_commission := COALESCE(v_booking.commission_amount, 0);
    v_base     := COALESCE(v_booking.base_price, v_total_p - v_commission);
    -- (037) El admin de sede ve SOLO la ganancia del complejo (precio base): ningún monto
    -- con la comisión de la empresa, ni en totales ni en gráficos (byDay, bySport, byVenue).
    IF v_my_role <> 'ADMIN' THEN
      v_total_p    := v_base;
      v_commission := 0;
    END IF;

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
      v_sport_entry := COALESCE(v_by_sport->v_sport_key, jsonb_build_object('sportId', v_booking.sport_id, 'name', v_booking.sport_name, 'count', 0, 'revenue', 0));
      v_by_sport := jsonb_set(v_by_sport, ARRAY[v_sport_key],
        jsonb_set(v_sport_entry, '{count}', to_jsonb((v_sport_entry->>'count')::int + 1))
      );

      -- Por venue (count por inicio)
      v_venue_key  := v_booking.fac_venue_id::text;
      v_venue_entry := COALESCE(v_by_venue->v_venue_key, jsonb_build_object('venueId', v_booking.fac_venue_id, 'venueName', v_booking.venue_name, 'total', 0, 'base', 0, 'commission', 0, 'count', 0));
      v_by_venue := jsonb_set(v_by_venue, ARRAY[v_venue_key],
        jsonb_set(v_venue_entry, '{count}', to_jsonb((v_venue_entry->>'count')::int + 1))
      );

      -- Clientes únicos y recientes
      IF NOT (v_booking.user_id = ANY(v_client_ids)) THEN
        v_client_ids := v_client_ids || v_booking.user_id;
      END IF;
      IF jsonb_array_length(v_recent) < 5 THEN
        IF NOT (v_booking.user_id = ANY(v_recent_seen)) THEN
          v_recent_seen := v_recent_seen || v_booking.user_id;
          v_recent := v_recent || jsonb_build_array(jsonb_build_object(
            'id',        v_booking.user_id,
            'firstName', v_booking.first_name,
            'lastName',  v_booking.last_name
          ));
        END IF;
      END IF;
    END IF;

    -- DINERO: solo turnos "ganados" (por FIN del turno)
    IF v_earned THEN
      v_total_revenue    := v_total_revenue    + v_total_p;
      v_total_commission := v_total_commission + v_commission;
      v_total_base       := v_total_base       + v_base;

      -- Por día AR del FIN del turno
      -- (036) Día del último instante del turno: 23:00-00:00 cuenta el día en que se jugó
      v_day_key := public.ar_day_key(v_booking.end_datetime - interval '1 microsecond');
      v_by_day := jsonb_set(
        v_by_day,
        ARRAY[v_day_key],
        to_jsonb(COALESCE((v_by_day->>v_day_key)::numeric, 0) + v_total_p)
      );

      -- Revenue por deporte (por fin ganado)
      v_sport_key  := v_booking.sport_id::text;
      v_sport_entry := COALESCE(v_by_sport->v_sport_key, jsonb_build_object('sportId', v_booking.sport_id, 'name', v_booking.sport_name, 'count', 0, 'revenue', 0));
      v_by_sport := jsonb_set(v_by_sport, ARRAY[v_sport_key],
        jsonb_set(v_sport_entry, '{revenue}', to_jsonb((v_sport_entry->>'revenue')::numeric + v_total_p))
      );

      -- Montos por venue (por fin ganado)
      v_venue_key  := v_booking.fac_venue_id::text;
      v_venue_entry := COALESCE(v_by_venue->v_venue_key, jsonb_build_object('venueId', v_booking.fac_venue_id, 'venueName', v_booking.venue_name, 'total', 0, 'base', 0, 'commission', 0, 'count', 0));
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
      'uniqueClients',    COALESCE(array_length(v_client_ids, 1), 0)
    ),
    'byStatus',   v_by_status,
    'byWeekday',  v_by_weekday,
    'byDay', COALESCE((
      SELECT json_agg(json_build_object('date', key, 'revenue', value::numeric) ORDER BY key)
      FROM jsonb_each_text(v_by_day)
    ), '[]'::json),
    'bySport', COALESCE((
      SELECT json_agg(value ORDER BY (value->>'count')::int DESC)
      FROM jsonb_each(v_by_sport)
      WHERE (value->>'count')::int > 0 OR (value->>'revenue')::numeric > 0
    ), '[]'::json),
    'byVenue', COALESCE((
      SELECT json_agg(value ORDER BY (value->>'base')::numeric DESC)
      FROM jsonb_each(v_by_venue)
      WHERE (value->>'count')::int > 0 OR (value->>'base')::numeric > 0
    ), '[]'::json),
    'recentClients', v_recent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_stats(text, text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_stats(text, text, text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_stats(text, text, text, uuid, uuid, text) TO authenticated;