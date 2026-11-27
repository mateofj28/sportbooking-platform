-- ============================================================
-- 067 — Entrenadores, Etapa 3: clases fijas y cambios del entrenador
-- (spec .kiro/specs/entrenadores, Req. 8, 4.6, E15, E23)
--
-- - recurring_classes: serie semanal de un cliente (8 fechas). Se crea con book_class_series:
--   salta las fechas que no se pueden, y paga todo / solo la próxima / nada, todo o nada.
-- - Pagar fechas pendientes (pay_class_booking / pay_class_bookings_batch) y cancelar la serie.
-- - cancel_unpaid_class_bookings: las mismas dos reglas que las canchas (lo llama cron-cancel-unpaid).
-- - Reprecio (E23): si el entrenador cambia una franja, las fechas SIN PAGAR de clases fijas a más
--   de 24 h toman la tarifa, el lugar y el horario nuevos (mantienen su posición dentro de la franja);
--   si ya no entran, se cancelan solas. Lo pagado no cambia. Los cambios quedan en
--   class_booking_changes y cron-notify-price-changes manda un email agrupado.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sport_id    uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  slot_id     uuid REFERENCES public.trainer_slots(id) ON DELETE SET NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):00$'),
  hours       smallint NOT NULL CHECK (hours BETWEEN 1 AND 8),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_classes_range CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_recurring_classes_user ON public.recurring_classes(user_id, created_at DESC);

ALTER TABLE public.class_bookings
  ADD COLUMN IF NOT EXISTS recurring_class_id uuid REFERENCES public.recurring_classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_class_bookings_recurring ON public.class_bookings(recurring_class_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_pending ON public.class_bookings(class_id)
  WHERE status = 'CONFIRMED' AND payment_status = 'PENDING';

-- Cambios de fechas sin pagar por cambios del entrenador (E23). Guarda lo que el cliente conocía.
CREATE TABLE IF NOT EXISTS public.class_booking_changes (
  class_booking_id uuid PRIMARY KEY REFERENCES public.class_bookings(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_total    numeric(10,2) NOT NULL,
  new_total    numeric(10,2) NOT NULL,
  old_start    timestamptz NOT NULL,
  new_start    timestamptz NOT NULL,
  old_location text NOT NULL,
  new_location text NOT NULL,
  cancelled    boolean NOT NULL DEFAULT false,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_class_booking_changes_user    ON public.class_booking_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_class_booking_changes_pending ON public.class_booking_changes(changed_at) WHERE notified_at IS NULL;

ALTER TABLE public.recurring_classes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_booking_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_classes_select ON public.recurring_classes;
CREATE POLICY recurring_classes_select ON public.recurring_classes FOR SELECT
  USING (user_id = auth.uid() OR trainer_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS class_booking_changes_select ON public.class_booking_changes;
CREATE POLICY class_booking_changes_select ON public.class_booking_changes FOR SELECT
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Horarios posibles: mismo cálculo que 066 con el horizonte como parámetro
--    (una clase única llega hasta 30 días; las fechas de una clase fija, hasta 8 semanas)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.class_options(uuid, date, uuid, int, uuid);
CREATE OR REPLACE FUNCTION public.class_options(
  p_trainer uuid, p_day date, p_sport uuid, p_hours int, p_user uuid, p_horizon int DEFAULT 30
)
RETURNS TABLE (
  start_at timestamptz, end_at timestamptz, slot_id uuid, location text, is_group boolean, capacity int,
  class_id uuid, taken int, already boolean, base bigint, commission bigint, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sp AS (
    SELECT s.id, s.class_max_students AS cap
      FROM public.sports s
     WHERE s.id = p_sport AND s.is_active AND s.classes_enabled AND p_hours = ANY (s.class_durations)
       AND public.trainer_is_public(p_trainer)
       AND EXISTS (SELECT 1 FROM public.trainer_sports ts WHERE ts.trainer_id = p_trainer AND ts.sport_id = p_sport)
  ),
  win AS (
    SELECT s.id AS slot_id, s.location, s.rate_individual, s.rate_group, s.commission_percent,
           ((d.day::timestamp + s.start_time::time) AT TIME ZONE 'America/Argentina/Buenos_Aires') AS w_from,
           ((d.day::timestamp + s.start_time::time) AT TIME ZONE 'America/Argentina/Buenos_Aires')
             + make_interval(mins => ((public.clock_minutes(s.end_time) - public.clock_minutes(s.start_time) + 1440) % 1440)) AS w_to
      FROM public.trainer_slots s
      JOIN public.trainer_slot_sports ss ON ss.slot_id = s.id AND ss.sport_id = p_sport
      CROSS JOIN (VALUES (p_day - 1), (p_day)) AS d(day)
     WHERE s.trainer_id = p_trainer AND s.is_active
       AND s.day_of_week = extract(isodow FROM d.day)::int - 1
  ),
  cand AS (
    SELECT w.*, g.st, g.st + make_interval(hours => p_hours) AS en, sp.cap
      FROM win w
      CROSS JOIN sp
      CROSS JOIN LATERAL generate_series(w.w_from, w.w_to - make_interval(hours => p_hours), interval '1 hour') AS g(st)
     WHERE public.ar_date(g.st) = p_day
       AND g.st >= now() + interval '24 hours'
       AND public.ar_date(g.st) <= public.ar_date(now()) + p_horizon
       AND NOT EXISTS (
         SELECT 1 FROM public.trainer_blocks b
          WHERE b.trainer_id = p_trainer
            AND b.start_date <= public.ar_date(g.st + make_interval(hours => p_hours) - interval '1 second')
            AND b.end_date   >= public.ar_date(g.st))
  ),
  ov AS (
    SELECT c.st, count(k.id) AS n_overlap,
           (max(k.id::text) FILTER (WHERE k.start_datetime = c.st AND k.sport_id = p_sport AND k.hours = p_hours AND k.is_group))::uuid AS match_id
      FROM cand c
      LEFT JOIN public.trainer_classes k
        ON k.trainer_id = p_trainer AND k.status <> 'CANCELLED'
       AND k.start_datetime < c.en AND k.end_datetime > c.st
     GROUP BY c.st
  )
  SELECT c.st, c.en, c.slot_id, c.location,
         coalesce(k.is_group, c.cap > 1), coalesce(k.capacity, c.cap)::int,
         k.id,
         coalesce((SELECT count(*) FROM public.class_bookings cb WHERE cb.class_id = k.id AND cb.status <> 'CANCELLED'), 0)::int,
         coalesce(EXISTS (SELECT 1 FROM public.class_bookings cb WHERE cb.class_id = k.id AND cb.user_id = p_user AND cb.status <> 'CANCELLED'), false),
         pr.base, pr.commission, pr.base + pr.commission
    FROM cand c
    JOIN ov ON ov.st = c.st
    LEFT JOIN public.trainer_classes k ON k.id = ov.match_id
    CROSS JOIN LATERAL (
      SELECT (CASE WHEN coalesce(k.is_group, c.cap > 1) THEN c.rate_group ELSE c.rate_individual END)::bigint * p_hours AS base,
             round((CASE WHEN coalesce(k.is_group, c.cap > 1) THEN c.rate_group ELSE c.rate_individual END)::numeric
                   * p_hours * c.commission_percent / 100)::bigint AS commission
    ) pr
   WHERE (ov.n_overlap = 0 OR (ov.n_overlap = 1 AND k.id IS NOT NULL))
     AND pr.base IS NOT NULL
     AND (k.id IS NULL OR (SELECT count(*) FROM public.class_bookings cb WHERE cb.class_id = k.id AND cb.status <> 'CANCELLED') < k.capacity)
   ORDER BY c.st;
$$;
REVOKE ALL ON FUNCTION public.class_options(uuid, date, uuid, int, uuid, int) FROM PUBLIC, anon, authenticated;

-- Ocupa un lugar en el horario de una opción: crea la clase o se suma (con la fila bloqueada). Uso interno.
CREATE OR REPLACE FUNCTION public.class_take_spot(
  p_trainer uuid, p_sport uuid, p_hours int, p_class uuid, p_slot uuid, p_start timestamptz, p_end timestamptz,
  p_is_group boolean, p_capacity int, p_location text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class uuid;
  v_cap   int;
  v_taken int;
BEGIN
  IF p_class IS NULL THEN
    INSERT INTO public.trainer_classes (trainer_id, sport_id, slot_id, start_datetime, end_datetime, hours,
                                        is_group, capacity, location)
    VALUES (p_trainer, p_sport, p_slot, p_start, p_end, p_hours, p_is_group, p_capacity, p_location)
    RETURNING id INTO v_class;
    RETURN v_class;
  END IF;
  SELECT capacity INTO v_cap FROM public.trainer_classes WHERE id = p_class AND status = 'OPEN' FOR UPDATE;
  SELECT count(*) INTO v_taken FROM public.class_bookings WHERE class_id = p_class AND status <> 'CANCELLED';
  IF v_cap IS NULL OR v_taken >= v_cap THEN
    RETURN NULL;
  END IF;
  RETURN p_class;
END;
$$;
REVOKE ALL ON FUNCTION public.class_take_spot(uuid, uuid, int, uuid, uuid, timestamptz, timestamptz, boolean, int, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Pagar fechas pendientes (paralelo a pay_booking / pay_bookings_batch)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_class_booking(p_id uuid, p_user uuid, p_expected bigint)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cb      public.class_bookings%ROWTYPE;
  v_start timestamptz;
  v_total bigint;
BEGIN
  SELECT * INTO cb FROM public.class_bookings WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'WL005';
  END IF;
  IF cb.user_id IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'Solo el titular de la reserva puede pagarla' USING ERRCODE = 'WL003';
  END IF;
  IF cb.payment_status = 'PAID' THEN
    RETURN json_build_object('paid', true, 'already', true, 'total', round(cb.total_price)::bigint);
  END IF;
  IF cb.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'No se puede pagar una clase cancelada o terminada' USING ERRCODE = 'WL004';
  END IF;
  SELECT start_datetime INTO v_start FROM public.trainer_classes WHERE id = cb.class_id;
  IF v_start <= now() THEN
    RAISE EXCEPTION 'La clase ya empezó: no se puede pagar' USING ERRCODE = 'WL004';
  END IF;
  v_total := round(cb.total_price)::bigint;
  IF p_expected IS NOT NULL AND p_expected <> v_total THEN
    RAISE EXCEPTION 'El precio de esta clase cambió a % créditos. Revisalo antes de pagar.', public.fmt_points(v_total)
      USING ERRCODE = 'WL002', DETAIL = json_build_object('total', v_total)::text;
  END IF;

  PERFORM public.wallet_apply_class(p_user, 'BOOKING_PAYMENT', -v_total, cb.id,
    'Reserva — ' || public.class_label(cb.class_id), p_user);
  UPDATE public.class_bookings SET payment_status = 'PAID', paid_at = now(), updated_at = now() WHERE id = cb.id;
  RETURN json_build_object('paid', true, 'already', false, 'total', v_total);
END;
$$;

-- Varias fechas juntas, todo o nada. p_expected = la suma que ve el cliente (NULL = no comparar).
CREATE OR REPLACE FUNCTION public.pay_class_bookings_batch(p_ids uuid[], p_user uuid, p_expected bigint)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids     uuid[];
  v_needed  bigint;
  v_balance bigint;
  v_id      uuid;
  v_res     json;
  v_paid    int := 0;
  v_total   bigint := 0;
BEGIN
  -- Solo lo propio, pendiente y que todavía no empezó (lo demás se ignora)
  SELECT coalesce(array_agg(cb.id ORDER BY c.start_datetime), '{}'), coalesce(sum(round(cb.total_price)), 0)::bigint
    INTO v_ids, v_needed
    FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
   WHERE cb.id = ANY (coalesce(p_ids, '{}')) AND cb.user_id = p_user
     AND cb.status = 'CONFIRMED' AND cb.payment_status = 'PENDING' AND c.start_datetime > now();
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'No hay fechas pendientes para pagar' USING ERRCODE = 'WL004';
  END IF;
  IF p_expected IS NOT NULL AND p_expected <> v_needed THEN
    RAISE EXCEPTION 'El total cambió a % créditos. Revisalo antes de pagar.', public.fmt_points(v_needed)
      USING ERRCODE = 'WL002', DETAIL = json_build_object('total', v_needed)::text;
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance < v_needed THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % créditos y tenés %. Te faltan %.',
      public.fmt_points(v_needed), public.fmt_points(v_balance), public.fmt_points(v_needed - v_balance)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', v_needed, 'available', v_balance, 'missing', v_needed - v_balance)::text;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_res := public.pay_class_booking(v_id, p_user, NULL);
    IF NOT coalesce((v_res ->> 'already')::boolean, false) THEN
      v_paid  := v_paid + 1;
      v_total := v_total + coalesce((v_res ->> 'total')::bigint, 0);
    END IF;
  END LOOP;
  RETURN json_build_object('paidCount', v_paid, 'total', v_total, 'ids', to_json(v_ids));
END;
$$;

-- ------------------------------------------------------------
-- 4. Crear una clase fija (Req. 8.1–8.3, E15): 8 fechas semanales desde la elegida.
--    p_pay_mode: 'ALL' | 'NEXT' | 'NONE'. Todo o nada: si el pago falla, no queda nada creado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_class_series(
  p_user uuid, p_trainer uuid, p_sport uuid, p_start timestamptz, p_hours int,
  p_pay_mode text, p_expected bigint, p_by uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_day0    date := public.ar_date(p_start);
  v_clock   text := to_char(p_start AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  v_series  uuid;
  v_slot    uuid;
  v_first   bigint;
  i         int;
  v_st      timestamptz;
  o         record;
  v_class   uuid;
  v_id      uuid;
  v_created json[] := '{}';
  v_ids     uuid[] := '{}';
  v_skipped json[] := '{}';
  v_reason  text;
  v_pay     json := json_build_object('paidCount', 0, 'total', 0);
BEGIN
  IF coalesce(p_pay_mode, '') NOT IN ('ALL', 'NEXT', 'NONE') THEN
    RAISE EXCEPTION 'Forma de pago inválida' USING ERRCODE = 'TR002';
  END IF;
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND is_active) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  IF p_user = p_trainer THEN
    RAISE EXCEPTION 'No podés reservar una clase con vos mismo' USING ERRCODE = 'TR002';
  END IF;
  IF p_start IS NULL OR p_hours IS NULL THEN
    RAISE EXCEPTION 'Elegí el horario y la duración' USING ERRCODE = 'TR002';
  END IF;
  IF NOT public.trainer_is_public(p_trainer) THEN
    RAISE EXCEPTION 'Este entrenador no está disponible para reservar' USING ERRCODE = 'TR004';
  END IF;
  IF p_start < now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Las clases se reservan con al menos 24 horas de anticipación' USING ERRCODE = 'TR002';
  END IF;
  IF v_day0 > public.ar_date(now()) + 30 THEN
    RAISE EXCEPTION 'La primera clase tiene que ser dentro de los próximos 30 días' USING ERRCODE = 'TR002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-classes:' || p_trainer::text, 0));

  -- La primera fecha tiene que estar disponible (es la que eligió el cliente)
  SELECT x.slot_id, x.total INTO v_slot, v_first FROM public.class_options(p_trainer, v_day0, p_sport, p_hours, p_user, 60) x
   WHERE x.start_at = p_start AND NOT x.already;
  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro.' USING ERRCODE = 'TR004';
  END IF;
  IF p_expected IS NOT NULL AND p_expected <> v_first THEN
    RAISE EXCEPTION 'El precio de esta clase cambió a % créditos. Revisalo antes de confirmar.', public.fmt_points(v_first)
      USING ERRCODE = 'WL002', DETAIL = json_build_object('total', v_first)::text;
  END IF;

  INSERT INTO public.recurring_classes (trainer_id, user_id, sport_id, slot_id, day_of_week, start_time, hours,
                                        start_date, end_date, created_by)
  VALUES (p_trainer, p_user, p_sport, v_slot, extract(isodow FROM v_day0)::int - 1, v_clock, p_hours,
          v_day0, v_day0 + 49, p_by)
  RETURNING id INTO v_series;

  FOR i IN 0..7 LOOP
    v_st := ((v_day0 + 7 * i)::timestamp + v_clock::time) AT TIME ZONE v_tz;
    SELECT * INTO o FROM public.class_options(p_trainer, v_day0 + 7 * i, p_sport, p_hours, p_user, 60) x
     WHERE x.start_at = v_st;
    v_reason := NULL;
    IF NOT FOUND THEN
      v_reason := CASE WHEN EXISTS (SELECT 1 FROM public.trainer_blocks b WHERE b.trainer_id = p_trainer
                                       AND b.start_date <= v_day0 + 7 * i AND b.end_date >= v_day0 + 7 * i)
                       THEN 'El entrenador no da clases ese día'
                       ELSE 'Horario no disponible' END;
    ELSIF o.already THEN
      v_reason := 'Ya tenés un lugar en esa clase';
    ELSE
      v_class := public.class_take_spot(p_trainer, p_sport, p_hours, o.class_id, o.slot_id, o.start_at, o.end_at, o.is_group, o.capacity, o.location);
      IF v_class IS NULL THEN
        v_reason := 'La clase está llena';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || json_build_object('start', v_st, 'reason', v_reason);
      CONTINUE;
    END IF;

    INSERT INTO public.class_bookings (class_id, user_id, status, payment_status, base_price, commission_amount,
                                       total_price, recurring_class_id, created_by)
    VALUES (v_class, p_user, 'CONFIRMED', 'PENDING', o.base, o.commission, o.total, v_series, p_by)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
    v_created := v_created || json_build_object('id', v_id, 'classId', v_class, 'start', o.start_at, 'total', o.total);
  END LOOP;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'No se pudo crear ninguna fecha: %', coalesce(v_skipped[1] ->> 'reason', 'horario no disponible')
      USING ERRCODE = 'TR004';
  END IF;

  IF p_pay_mode = 'ALL' THEN
    v_pay := public.pay_class_bookings_batch(v_ids, p_user, NULL);
  ELSIF p_pay_mode = 'NEXT' THEN
    v_pay := public.pay_class_bookings_batch(v_ids[1:1], p_user, NULL);
  END IF;

  RETURN json_build_object(
    'recurringClassId', v_series,
    'createdCount', cardinality(v_ids), 'skippedCount', cardinality(v_skipped),
    'paidCount', coalesce((v_pay ->> 'paidCount')::int, 0), 'paidTotal', coalesce((v_pay ->> 'total')::bigint, 0),
    'created', to_json(v_created), 'skipped', to_json(v_skipped));
END;
$$;

-- ------------------------------------------------------------
-- 5. Cancelar la serie (Req. 8.5). Su propia serie: fechas a 24 h o más. El entrenador o el admin
--    general: todas las futuras, con motivo. Lo pagado vuelve al 100%.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_recurring_class(p_id uuid, p_by uuid, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        public.recurring_classes%ROWTYPE;
  v_role   text;
  v_cutoff timestamptz;
  r        record;
  v_ref    bigint;
  v_total  bigint := 0;
  v_items  json[] := '{}';
BEGIN
  SELECT * INTO s FROM public.recurring_classes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase fija no encontrada' USING ERRCODE = 'WL005';
  END IF;
  v_role := public.class_actor_role(p_by, s.user_id, s.trainer_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  IF v_role <> 'CLIENT' AND char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 300 THEN
    RAISE EXCEPTION 'El motivo puede tener hasta 300 caracteres' USING ERRCODE = 'WL006';
  END IF;
  v_cutoff := CASE WHEN v_role = 'CLIENT' THEN now() + interval '24 hours' ELSE now() END;

  FOR r IN
    SELECT cb.id, cb.class_id FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
     WHERE cb.recurring_class_id = s.id AND cb.status = 'CONFIRMED' AND c.start_datetime >= v_cutoff
     ORDER BY c.start_datetime
     FOR UPDATE OF cb
  LOOP
    v_ref := public.class_booking_do_cancel(r.id, p_by, v_role, coalesce(NULLIF(btrim(p_reason), ''), 'Clase fija cancelada'));
    PERFORM public.close_empty_class(r.class_id, p_by);
    v_total := v_total + v_ref;
    v_items := v_items || json_build_object('id', r.id, 'refunded', v_ref);
  END LOOP;

  UPDATE public.recurring_classes SET is_active = false, updated_at = now() WHERE id = s.id;
  RETURN json_build_object('recurringClassId', s.id, 'role', v_role, 'cancelledCount', cardinality(v_items),
                           'refunded', v_total, 'userId', s.user_id, 'trainerId', s.trainer_id, 'items', to_json(v_items));
END;
$$;

-- ------------------------------------------------------------
-- 6. Fechas sin pagar (Req. 8.4): mismas dos reglas que las canchas (cron-cancel-unpaid)
--    - ya empezó sin pagar -> se cancela;
--    - empieza en menos de 24 h y existía antes de ese límite -> se cancela.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_unpaid_class_bookings()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        record;
  v_reason text;
  v_items  json[] := '{}';
BEGIN
  FOR r IN
    SELECT cb.id, cb.class_id, cb.created_at, c.start_datetime
      FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
     WHERE cb.status = 'CONFIRMED' AND cb.payment_status = 'PENDING'
       AND c.start_datetime <= now() + interval '24 hours'
     ORDER BY c.start_datetime
     FOR UPDATE OF cb SKIP LOCKED
  LOOP
    v_reason := CASE
      WHEN r.start_datetime <= now() THEN 'Cancelada automáticamente: no se pagó antes del inicio de la clase'
      WHEN r.created_at <= r.start_datetime - interval '24 hours'
        THEN 'Cancelada automáticamente por falta de pago (menos de 24 h de antelación)'
    END;
    CONTINUE WHEN v_reason IS NULL;
    PERFORM public.class_booking_do_cancel(r.id, NULL, 'SYSTEM', v_reason);
    PERFORM public.close_empty_class(r.class_id, NULL);
    v_items := v_items || json_build_object('id', r.id, 'classId', r.class_id, 'reason', v_reason);
  END LOOP;
  RETURN to_json(v_items);
END;
$$;

-- ------------------------------------------------------------
-- 7. Reprecio y movimiento por cambios de franja (E23, 4.6, 8.7)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_class_change(
  p_cb uuid, p_user uuid, p_old_total numeric, p_new_total numeric, p_old_start timestamptz, p_new_start timestamptz,
  p_old_location text, p_new_location text, p_cancelled boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.class_booking_changes AS c (class_booking_id, user_id, old_total, new_total, old_start, new_start,
                                                 old_location, new_location, cancelled)
  VALUES (p_cb, p_user, p_old_total, p_new_total, p_old_start, p_new_start, p_old_location, p_new_location, p_cancelled)
  ON CONFLICT (class_booking_id) DO UPDATE
     -- Si no se avisó todavía, se conserva lo que el cliente conocía
     SET old_total    = CASE WHEN c.notified_at IS NULL THEN c.old_total    ELSE EXCLUDED.old_total END,
         old_start    = CASE WHEN c.notified_at IS NULL THEN c.old_start    ELSE EXCLUDED.old_start END,
         old_location = CASE WHEN c.notified_at IS NULL THEN c.old_location ELSE EXCLUDED.old_location END,
         new_total = EXCLUDED.new_total, new_start = EXCLUDED.new_start, new_location = EXCLUDED.new_location,
         cancelled = EXCLUDED.cancelled, changed_at = now(), notified_at = NULL;
  -- Volvió a lo que el cliente conocía: no hay nada que avisar
  DELETE FROM public.class_booking_changes
   WHERE class_booking_id = p_cb AND notified_at IS NULL AND NOT cancelled
     AND old_total = new_total AND old_start = new_start AND old_location = new_location;
END;
$$;

-- Cancela por el sistema una fecha sin pagar y deja registro para el aviso. Uso interno.
CREATE OR REPLACE FUNCTION public.system_cancel_class_booking(p_cb uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cb public.class_bookings%ROWTYPE;
  c  public.trainer_classes%ROWTYPE;
BEGIN
  SELECT * INTO cb FROM public.class_bookings WHERE id = p_cb;
  SELECT * INTO c FROM public.trainer_classes WHERE id = cb.class_id;
  PERFORM public.class_booking_do_cancel(p_cb, NULL, 'SYSTEM', p_reason);
  PERFORM public.close_empty_class(cb.class_id, NULL);
  PERFORM public.record_class_change(p_cb, cb.user_id, cb.total_price, cb.total_price, c.start_datetime, c.start_datetime,
                                     c.location, c.location, true);
END;
$$;

-- Fechas sin pagar de clases fijas de una franja, a más de 24 h: toman la franja vigente.
-- p_old_day / p_old_start: cómo era la franja antes del cambio (para mantener la posición).
CREATE OR REPLACE FUNCTION public.reprice_slot_class_bookings(p_slot uuid, p_old_day smallint, p_old_start text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  s         public.trainer_slots%ROWTYPE;
  r         record;
  o         record;
  v_len     int;
  v_off     int;
  v_occ     date;
  v_win     timestamptz;
  v_new     timestamptz;
  v_ok      boolean;
  v_rate    bigint;
  v_base    bigint;
  v_comm    bigint;
  v_solo    boolean;
  v_target  uuid;
  v_loc     text;
  v_n       int := 0;
BEGIN
  SELECT * INTO s FROM public.trainer_slots WHERE id = p_slot;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-classes:' || s.trainer_id::text, 0));
  v_len := (public.clock_minutes(s.end_time) - public.clock_minutes(s.start_time) + 1440) % 1440;

  FOR r IN
    SELECT cb.id AS cb_id, cb.user_id, cb.total_price, cb.base_price, cb.commission_amount,
           c.id AS class_id, c.sport_id, c.start_datetime, c.end_datetime, c.hours, c.is_group, c.location
      FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
     WHERE c.slot_id = p_slot AND c.status = 'OPEN'
       AND cb.recurring_class_id IS NOT NULL AND cb.status = 'CONFIRMED' AND cb.payment_status = 'PENDING'
       AND c.start_datetime > now() + interval '24 hours'
     ORDER BY c.start_datetime
     FOR UPDATE OF cb
  LOOP
    -- Posición dentro de la franja (minutos desde su inicio) y día en que empieza esa franja
    v_off := (public.clock_minutes(to_char(r.start_datetime AT TIME ZONE v_tz, 'HH24:MI'))
              - public.clock_minutes(p_old_start) + 1440) % 1440;
    v_occ := public.ar_date(r.start_datetime - make_interval(mins => v_off)) + (s.day_of_week - p_old_day);
    v_win := (v_occ::timestamp + s.start_time::time) AT TIME ZONE v_tz;
    v_new := v_win + make_interval(mins => v_off);

    v_ok := s.is_active
        AND EXISTS (SELECT 1 FROM public.trainer_slot_sports ss WHERE ss.slot_id = s.id AND ss.sport_id = r.sport_id)
        AND v_new + make_interval(hours => r.hours) <= v_win + make_interval(mins => v_len)
        AND v_new >= now() + interval '24 hours';
    IF NOT v_ok THEN
      PERFORM public.system_cancel_class_booking(r.cb_id, 'El entrenador cambió su horario y esta fecha ya no entra');
      v_n := v_n + 1;
      CONTINUE;
    END IF;

    IF v_new = r.start_datetime THEN
      -- Mismo horario: tarifa y lugar vigentes
      v_rate := CASE WHEN r.is_group THEN s.rate_group ELSE s.rate_individual END;
      IF v_rate IS NULL THEN
        PERFORM public.system_cancel_class_booking(r.cb_id, 'El entrenador ya no ofrece este tipo de clase en ese horario');
        v_n := v_n + 1;
        CONTINUE;
      END IF;
      v_base := v_rate * r.hours;
      v_comm := round(v_base * s.commission_percent / 100);
      v_loc  := r.location;
      -- El lugar de la clase cambia solo si nadie la pagó (lo pagado conserva su lugar)
      IF s.location <> r.location AND NOT EXISTS (
           SELECT 1 FROM public.class_bookings x WHERE x.class_id = r.class_id AND x.status <> 'CANCELLED' AND x.payment_status = 'PAID') THEN
        UPDATE public.trainer_classes SET location = s.location, updated_at = now() WHERE id = r.class_id;
        v_loc := s.location;
      END IF;
      IF v_base <> r.base_price OR v_comm <> r.commission_amount THEN
        UPDATE public.class_bookings
           SET base_price = v_base, commission_amount = v_comm, total_price = v_base + v_comm, updated_at = now()
         WHERE id = r.cb_id;
      END IF;
      PERFORM public.record_class_change(r.cb_id, r.user_id, r.total_price, v_base + v_comm,
                                         r.start_datetime, r.start_datetime, r.location, v_loc, false);
      v_n := v_n + 1;
      CONTINUE;
    END IF;

    -- Nuevo horario: la fecha se mueve a la clase de ese horario (la crea o se suma)
    v_solo := NOT EXISTS (SELECT 1 FROM public.class_bookings x
                           WHERE x.class_id = r.class_id AND x.id <> r.cb_id AND x.status <> 'CANCELLED');
    IF v_solo THEN
      -- Libera su propio horario para que no se pise consigo misma
      UPDATE public.trainer_classes
         SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = 'Sin alumnos', updated_at = now()
       WHERE id = r.class_id;
    END IF;

    SELECT * INTO o FROM public.class_options(s.trainer_id, public.ar_date(v_new), r.sport_id, r.hours, r.user_id, 60) x
     WHERE x.start_at = v_new;
    IF NOT FOUND OR o.already THEN
      PERFORM public.system_cancel_class_booking(r.cb_id, 'El entrenador cambió su horario y el nuevo horario no está disponible');
      v_n := v_n + 1;
      CONTINUE;
    END IF;

    IF o.class_id IS NULL AND v_solo THEN
      -- Se reutiliza la misma clase, en el horario nuevo
      UPDATE public.trainer_classes
         SET start_datetime = o.start_at, end_datetime = o.end_at, location = o.location, slot_id = o.slot_id,
             is_group = o.is_group, capacity = o.capacity, status = 'OPEN', cancelled_at = NULL,
             cancelled_by = NULL, cancellation_reason = NULL, updated_at = now()
       WHERE id = r.class_id;
      v_target := r.class_id;
    ELSE
      v_target := public.class_take_spot(s.trainer_id, r.sport_id, r.hours, o.class_id, o.slot_id, o.start_at, o.end_at, o.is_group, o.capacity, o.location);
      IF v_target IS NULL THEN
        PERFORM public.system_cancel_class_booking(r.cb_id, 'El entrenador cambió su horario y la clase nueva está llena');
        v_n := v_n + 1;
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.class_bookings
       SET class_id = v_target, base_price = o.base, commission_amount = o.commission, total_price = o.total, updated_at = now()
     WHERE id = r.cb_id;
    PERFORM public.close_empty_class(r.class_id, NULL);
    PERFORM public.record_class_change(r.cb_id, r.user_id, r.total_price, o.total, r.start_datetime, o.start_at,
                                       r.location, o.location, false);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Triggers de las franjas
CREATE OR REPLACE FUNCTION public.trainer_slot_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- BEFORE DELETE: todavía se ven las clases de la franja (después el FK deja slot_id en NULL)
    PERFORM pg_advisory_xact_lock(hashtextextended('trainer-classes:' || OLD.trainer_id::text, 0));
    FOR r IN
      SELECT cb.id FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
       WHERE c.slot_id = OLD.id AND c.status = 'OPEN'
         AND cb.recurring_class_id IS NOT NULL AND cb.status = 'CONFIRMED' AND cb.payment_status = 'PENDING'
         AND c.start_datetime > now() + interval '24 hours'
       FOR UPDATE OF cb
    LOOP
      PERFORM public.system_cancel_class_booking(r.id, 'El entrenador quitó esa franja de su disponibilidad');
    END LOOP;
    RETURN OLD;
  END IF;
  IF (OLD.day_of_week, OLD.start_time, OLD.end_time, OLD.location, OLD.rate_individual, OLD.rate_group,
      OLD.commission_percent, OLD.is_active)
     IS DISTINCT FROM
     (NEW.day_of_week, NEW.start_time, NEW.end_time, NEW.location, NEW.rate_individual, NEW.rate_group,
      NEW.commission_percent, NEW.is_active) THEN
    PERFORM public.reprice_slot_class_bookings(NEW.id, OLD.day_of_week, OLD.start_time);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trainer_slot_changed_del ON public.trainer_slots;
CREATE TRIGGER trainer_slot_changed_del BEFORE DELETE ON public.trainer_slots
  FOR EACH ROW EXECUTE FUNCTION public.trainer_slot_changed();
DROP TRIGGER IF EXISTS trainer_slot_changed_upd ON public.trainer_slots;
CREATE TRIGGER trainer_slot_changed_upd AFTER UPDATE ON public.trainer_slots
  FOR EACH ROW EXECUTE FUNCTION public.trainer_slot_changed();

-- Quitar un deporte de una franja: sus fechas sin pagar de ese deporte se cancelan
CREATE OR REPLACE FUNCTION public.trainer_slot_sport_removed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.trainer_slots%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.trainer_slots WHERE id = OLD.slot_id;
  IF FOUND THEN
    PERFORM public.reprice_slot_class_bookings(s.id, s.day_of_week, s.start_time);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trainer_slot_sport_removed ON public.trainer_slot_sports;
CREATE TRIGGER trainer_slot_sport_removed AFTER DELETE ON public.trainer_slot_sports
  FOR EACH ROW EXECUTE FUNCTION public.trainer_slot_sport_removed();

-- ------------------------------------------------------------
-- 8. Lecturas del cliente
-- ------------------------------------------------------------
-- Mis reservas de clase (066) + clase fija, cambios pendientes de aviso y si se puede pagar
CREATE OR REPLACE FUNCTION public.my_class_bookings(p_scope text DEFAULT 'UPCOMING', p_page int DEFAULT 1, p_size int DEFAULT 20)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_up   boolean := coalesce(p_scope, 'UPCOMING') = 'UPCOMING';
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN (
    WITH f AS (
      SELECT cb.*, c.start_datetime, c.end_datetime
        FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
       WHERE cb.user_id = v_me
         AND CASE WHEN v_up THEN cb.status = 'CONFIRMED' AND c.end_datetime > now()
                  ELSE NOT (cb.status = 'CONFIRMED' AND c.end_datetime > now()) END
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'id', x.id, 'status', x.status, 'paymentStatus', x.payment_status, 'totalPrice', x.total_price,
                 'recurringClassId', x.recurring_class_id,
                 'cancelledAt', x.cancelled_at, 'cancelledByRole', x.cancelled_by_role,
                 'cancellationReason', x.cancellation_reason, 'createdAt', x.created_at,
                 'canCancel', x.status = 'CONFIRMED' AND x.start_datetime - now() >= interval '24 hours',
                 'payable', x.status = 'CONFIRMED' AND x.payment_status = 'PENDING' AND x.start_datetime > now(),
                 'change', (SELECT json_build_object('oldTotal', ch.old_total, 'newTotal', ch.new_total,
                                                     'oldStart', ch.old_start, 'newStart', ch.new_start,
                                                     'oldLocation', ch.old_location, 'newLocation', ch.new_location)
                              FROM public.class_booking_changes ch
                             WHERE ch.class_booking_id = x.id AND NOT ch.cancelled AND x.payment_status = 'PENDING'),
                 'class', public.class_json(x.class_id, 'CLIENT'))
               ORDER BY CASE WHEN v_up THEN x.start_datetime END ASC, CASE WHEN NOT v_up THEN x.start_datetime END DESC)
          FROM (SELECT * FROM f
                 ORDER BY CASE WHEN v_up THEN start_datetime END ASC, CASE WHEN NOT v_up THEN start_datetime END DESC, id
                 LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- Mis clases fijas, con las fechas pendientes de pago que todavía se pueden pagar
CREATE OR REPLACE FUNCTION public.my_recurring_classes()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  RETURN coalesce((
    SELECT json_agg(json_build_object(
             'id', s.id, 'isActive', s.is_active, 'dayOfWeek', s.day_of_week, 'startTime', s.start_time,
             'hours', s.hours, 'startDate', s.start_date, 'endDate', s.end_date,
             'sport', json_build_object('id', sp.id, 'name', sp.name),
             'trainer', json_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name),
             'upcomingCount', (SELECT count(*) FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
                                WHERE cb.recurring_class_id = s.id AND cb.status = 'CONFIRMED' AND c.end_datetime > now()),
             'pending', coalesce((SELECT json_agg(json_build_object('id', cb.id, 'total', cb.total_price) ORDER BY c.start_datetime)
                                    FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
                                   WHERE cb.recurring_class_id = s.id AND cb.status = 'CONFIRMED'
                                     AND cb.payment_status = 'PENDING' AND c.start_datetime > now()), '[]'::json))
           ORDER BY s.is_active DESC, s.created_at DESC)
      FROM public.recurring_classes s
      JOIN public.sports sp ON sp.id = s.sport_id
      JOIN public.profiles p ON p.id = s.trainer_id
     WHERE s.user_id = v_me
  ), '[]'::json);
END;
$$;

-- class_json (066) + marca de clase fija en cada alumno (para el entrenador y el admin)
CREATE OR REPLACE FUNCTION public.class_json(p_class uuid, p_view text)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'classId', c.id, 'status', c.status, 'start', c.start_datetime, 'end', c.end_datetime, 'hours', c.hours,
    'isGroup', c.is_group, 'capacity', c.capacity, 'location', c.location,
    'sport', json_build_object('id', sp.id, 'name', sp.name),
    'trainer', json_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'avatarUrl', p.avatar_url),
    'cancelledAt', c.cancelled_at, 'cancellationReason', c.cancellation_reason,
    'taken', (SELECT count(*) FROM public.class_bookings cb WHERE cb.class_id = c.id AND cb.status <> 'CANCELLED'),
    'students', CASE WHEN p_view IN ('TRAINER', 'ADMIN') THEN coalesce((
      SELECT json_agg(json_build_object(
               'bookingId', cb.id, 'userId', cb.user_id, 'firstName', u.first_name, 'lastName', u.last_name,
               'email', CASE WHEN p_view = 'ADMIN' THEN u.email END,
               'status', cb.status, 'paymentStatus', cb.payment_status, 'isRecurring', cb.recurring_class_id IS NOT NULL,
               'basePrice', cb.base_price,
               'commissionAmount', CASE WHEN p_view = 'ADMIN' THEN cb.commission_amount END,
               'totalPrice', CASE WHEN p_view = 'ADMIN' THEN cb.total_price END,
               'cancelledAt', cb.cancelled_at, 'cancelledByRole', cb.cancelled_by_role,
               'cancellationReason', cb.cancellation_reason, 'createdAt', cb.created_at)
             ORDER BY cb.created_at)
        FROM public.class_bookings cb JOIN public.profiles u ON u.id = cb.user_id
       WHERE cb.class_id = c.id), '[]'::json) END
  )
    FROM public.trainer_classes c
    JOIN public.sports sp ON sp.id = c.sport_id
    JOIN public.profiles p ON p.id = c.trainer_id
   WHERE c.id = p_class;
$$;

-- ------------------------------------------------------------
-- 9. Permisos
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_class_change(uuid, uuid, numeric, numeric, timestamptz, timestamptz, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.system_cancel_class_booking(uuid, text)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprice_slot_class_bookings(uuid, smallint, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trainer_slot_changed()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trainer_slot_sport_removed()                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_json(uuid, text)                                 FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pay_class_booking(uuid, uuid, bigint)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_class_bookings_batch(uuid[], uuid, bigint)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.book_class_series(uuid, uuid, uuid, timestamptz, int, text, bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_recurring_class(uuid, uuid, text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_unpaid_class_bookings()                         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_class_booking(uuid, uuid, bigint)               TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_class_bookings_batch(uuid[], uuid, bigint)      TO service_role;
GRANT EXECUTE ON FUNCTION public.book_class_series(uuid, uuid, uuid, timestamptz, int, text, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_recurring_class(uuid, uuid, text)            TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_class_bookings()                      TO service_role;

REVOKE ALL ON FUNCTION public.my_recurring_classes()                                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_recurring_classes()                              TO authenticated;

NOTIFY pgrst, 'reload schema';
