-- ============================================================
-- 066 — Entrenadores, Etapa 2: reservar una clase única
-- (spec .kiro/specs/entrenadores, Req. 5, 6, 7, 9, 4.8)
--
-- - trainer_classes: un horario concreto del entrenador (1 o más alumnos). EXCLUDE: nunca dos
--   clases del mismo entrenador a la vez.
-- - class_bookings: el lugar de un cliente en una clase. Se paga al reservar con la billetera
--   (mismos kinds BOOKING_PAYMENT / BOOKING_REFUND: los totales de Balances (057) los cuentan).
-- - Disponibilidad, búsqueda, perfil público, reservar, cancelar y listados por rol.
-- - trainer_add_block rechaza días con clases reservadas (E16).
-- Todo por funciones: nadie escribe estas tablas directo.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.class_status AS ENUM ('OPEN', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trainer_classes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id          uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE RESTRICT,
  sport_id            uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  slot_id             uuid REFERENCES public.trainer_slots(id) ON DELETE SET NULL,
  start_datetime      timestamptz NOT NULL,
  end_datetime        timestamptz NOT NULL,
  hours               smallint NOT NULL CHECK (hours BETWEEN 1 AND 8),
  is_group            boolean NOT NULL,
  capacity            smallint NOT NULL CHECK (capacity BETWEEN 1 AND 50),
  location            text NOT NULL CHECK (char_length(btrim(location)) BETWEEN 1 AND 200),
  status              public.class_status NOT NULL DEFAULT 'OPEN',
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 300),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_classes_duration CHECK (end_datetime = start_datetime + make_interval(hours => hours)),
  CONSTRAINT trainer_classes_whole_hour CHECK (extract(epoch FROM start_datetime)::bigint % 3600 = 0),
  CONSTRAINT trainer_classes_group CHECK (is_group = (capacity > 1)),
  CONSTRAINT trainer_classes_cancel_shape CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  -- Req. 7.4: el entrenador nunca tiene dos clases a la vez (la base es la última barrera)
  CONSTRAINT trainer_classes_no_overlap EXCLUDE USING gist (
    trainer_id extensions.gist_uuid_ops WITH =,
    tstzrange(start_datetime, end_datetime, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);
CREATE INDEX IF NOT EXISTS idx_trainer_classes_trainer_start ON public.trainer_classes(trainer_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_trainer_classes_start         ON public.trainer_classes(start_datetime);

CREATE TABLE IF NOT EXISTS public.class_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            uuid NOT NULL REFERENCES public.trainer_classes(id) ON DELETE RESTRICT,
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status              public.booking_status NOT NULL DEFAULT 'CONFIRMED' CHECK (status <> 'PENDING'),
  payment_status      public.payment_status NOT NULL DEFAULT 'PENDING',
  paid_at             timestamptz,
  base_price          numeric(10,2) NOT NULL CHECK (base_price >= 0),
  commission_amount   numeric(10,2) NOT NULL CHECK (commission_amount >= 0),
  total_price         numeric(10,2) NOT NULL CHECK (total_price = base_price + commission_amount),
  reminder_sent_at    timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_by_role   text CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('CLIENT', 'TRAINER', 'ADMIN', 'SYSTEM')),
  cancellation_reason text CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 300),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_bookings_cancel_shape CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by_role IS NOT NULL)),
  CONSTRAINT class_bookings_paid_shape   CHECK ((payment_status = 'PAID') = (paid_at IS NOT NULL))
);
-- Req. 7.5: un cliente no reserva dos veces la misma clase
CREATE UNIQUE INDEX IF NOT EXISTS class_bookings_one_per_user ON public.class_bookings(class_id, user_id) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_class_bookings_class ON public.class_bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_user  ON public.class_bookings(user_id, created_at DESC);

-- Billetera: el movimiento apunta a una reserva de cancha O a una de clase, nunca a las dos
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS class_booking_id uuid REFERENCES public.class_bookings(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_tx_one_target CHECK (booking_id IS NULL OR class_booking_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_class_one_payment ON public.wallet_transactions(class_booking_id)
  WHERE kind = 'BOOKING_PAYMENT' AND class_booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_class_one_refund ON public.wallet_transactions(class_booking_id)
  WHERE kind = 'BOOKING_REFUND' AND class_booking_id IS NOT NULL;

-- RLS: solo lectura (las escrituras van por las funciones de abajo)
ALTER TABLE public.trainer_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_bookings  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trainer_classes_select ON public.trainer_classes;
CREATE POLICY trainer_classes_select ON public.trainer_classes FOR SELECT
  USING (trainer_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS class_bookings_select ON public.class_bookings;
CREATE POLICY class_bookings_select ON public.class_bookings FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------
-- 2. Utilidades
-- ------------------------------------------------------------
-- Día AR de un instante
CREATE OR REPLACE FUNCTION public.ar_date(p_ts timestamptz)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (p_ts AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

-- "Clase de Pádel con Marcos Pérez · 14 nov 2026, 6:00 pm"
CREATE OR REPLACE FUNCTION public.class_label(p_class uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Clase de ' || sp.name || ' con ' || btrim(p.first_name || ' ' || p.last_name)
         || ' · ' || public.fmt_ar_datetime(c.start_datetime)
    FROM public.trainer_classes c
    JOIN public.sports sp ON sp.id = c.sport_id
    JOIN public.profiles p ON p.id = c.trainer_id
   WHERE c.id = p_class;
$$;

-- Movimiento de billetera de una reserva de clase (igual que wallet_apply, con class_booking_id)
CREATE OR REPLACE FUNCTION public.wallet_apply_class(
  p_user uuid, p_kind public.wallet_tx_kind, p_amount bigint, p_class_booking uuid, p_detail text, p_by uuid
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance bigint;
  v_new     bigint;
BEGIN
  IF p_kind NOT IN ('BOOKING_PAYMENT', 'BOOKING_REFUND') THEN
    RAISE EXCEPTION 'Movimiento inválido' USING ERRCODE = 'WL006';
  END IF;
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  v_new := v_balance + p_amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % créditos y tenés %. Te faltan %.',
      public.fmt_points(-p_amount), public.fmt_points(v_balance), public.fmt_points(-v_new)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', -p_amount, 'available', v_balance, 'missing', -v_new)::text;
  END IF;
  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, class_booking_id, detail, created_by)
  VALUES (p_user, p_kind, p_amount, v_new, p_class_booking, left(p_detail, 300), p_by);
  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_user;
  RETURN v_new;
END;
$$;

-- ------------------------------------------------------------
-- 3. Horarios posibles de un día (Req. 6). Una sola consulta; la usan la disponibilidad y la reserva.
--    - Inicio en pasos de 1 h dentro de una franja activa que da ese deporte (franjas del día y las
--      del día anterior que cruzan la medianoche), y la clase entera tiene que entrar en la franja.
--    - Desde 24 h y hasta 30 días AR (E12). Sin bloqueos en ningún día que toque la clase.
--    - Si se pisa con una clase: solo se ofrece sumarse si es grupal, mismo inicio, deporte y
--      duración, y tiene lugar (E14). Si no, no se ofrece.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_options(p_trainer uuid, p_day date, p_sport uuid, p_hours int, p_user uuid)
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
       AND public.ar_date(g.st) <= public.ar_date(now()) + 30
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

-- Lo que ve el cliente: horarios de un día con precio final (sin base ni comisión)
CREATE OR REPLACE FUNCTION public.trainer_availability(p_trainer uuid, p_date text, p_sport uuid, p_hours int)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day date;
BEGIN
  BEGIN
    v_day := p_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = 'TR002';
  END;
  RETURN json_build_object(
    'date', v_day,
    'options', coalesce((
      SELECT json_agg(json_build_object(
               'start', o.start_at, 'end', o.end_at, 'hours', p_hours, 'location', o.location,
               'isGroup', o.is_group, 'capacity', o.capacity, 'spotsLeft', o.capacity - o.taken,
               'joinsExisting', o.class_id IS NOT NULL, 'already', o.already, 'total', o.total)
             ORDER BY o.start_at)
        FROM public.class_options(p_trainer, v_day, p_sport, p_hours, auth.uid()) o
    ), '[]'::json)
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. Búsqueda y perfil público (Req. 5)
-- ------------------------------------------------------------
-- Precio final por hora de una tarifa (mismo redondeo que el panel del entrenador)
CREATE OR REPLACE FUNCTION public.trainer_final_rate(p_rate integer, p_percent numeric)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_rate IS NULL THEN NULL ELSE p_rate + round(p_rate * p_percent / 100)::bigint END;
$$;

CREATE OR REPLACE FUNCTION public.search_trainers(
  p_sport uuid DEFAULT NULL, p_dow int DEFAULT NULL, p_min bigint DEFAULT NULL, p_max bigint DEFAULT NULL,
  p_page int DEFAULT 1, p_size int DEFAULT 12
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_size int := least(greatest(coalesce(p_size, 12), 1), 50);
  v_page int := greatest(coalesce(p_page, 1), 1);
BEGIN
  IF p_dow IS NOT NULL AND p_dow NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'Día inválido' USING ERRCODE = 'TR002';
  END IF;
  RETURN (
    WITH prices AS (
      -- Precio final de cada franja que cumple los filtros de deporte y día
      SELECT s.trainer_id, s.day_of_week, x.price
        FROM public.trainer_slots s
        CROSS JOIN LATERAL (
          SELECT public.trainer_final_rate(s.rate_individual, s.commission_percent) AS price
          UNION ALL
          SELECT public.trainer_final_rate(s.rate_group, s.commission_percent)
           WHERE s.rate_group IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.trainer_slot_sports ss JOIN public.sports sp ON sp.id = ss.sport_id
                          WHERE ss.slot_id = s.id AND sp.class_max_students > 1)
        ) x
       WHERE s.is_active
         AND (p_dow IS NULL OR s.day_of_week = p_dow)
         AND EXISTS (SELECT 1 FROM public.trainer_slot_sports ss JOIN public.sports sp ON sp.id = ss.sport_id
                      WHERE ss.slot_id = s.id AND sp.is_active AND sp.classes_enabled
                        AND (p_sport IS NULL OR sp.id = p_sport))
    ),
    f AS (
      SELECT t.user_id, p.first_name, p.last_name, p.avatar_url, t.bio, t.published_at, min(pr.price) AS min_price
        FROM public.trainers t
        JOIN public.profiles p ON p.id = t.user_id
        JOIN prices pr ON pr.trainer_id = t.user_id
       WHERE t.status = 'PUBLISHED' AND p.role = 'TRAINER' AND p.is_active
         AND (p_min IS NULL OR pr.price >= p_min)
         AND (p_max IS NULL OR pr.price <= p_max)
       GROUP BY t.user_id, p.first_name, p.last_name, p.avatar_url, t.bio, t.published_at
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'trainerId', x.user_id, 'firstName', x.first_name, 'lastName', x.last_name,
                 'avatarUrl', x.avatar_url, 'bio', x.bio, 'minPrice', x.min_price,
                 'sports', coalesce((SELECT json_agg(sp.name ORDER BY sp.name) FROM public.trainer_sports ts
                                       JOIN public.sports sp ON sp.id = ts.sport_id
                                      WHERE ts.trainer_id = x.user_id AND sp.is_active AND sp.classes_enabled), '[]'::json),
                 'days', coalesce((SELECT json_agg(DISTINCT s.day_of_week) FROM public.trainer_slots s
                                    WHERE s.trainer_id = x.user_id AND s.is_active), '[]'::json))
               ORDER BY x.min_price, x.last_name, x.user_id)
          FROM (SELECT * FROM f ORDER BY min_price, last_name, user_id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_public_profile(p_trainer uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.trainer_is_public(p_trainer) THEN
    RAISE EXCEPTION 'Este entrenador no está disponible' USING ERRCODE = 'TR003';
  END IF;
  RETURN (
    SELECT json_build_object(
      'trainerId', t.user_id, 'firstName', p.first_name, 'lastName', p.last_name, 'avatarUrl', p.avatar_url,
      'bio', t.bio, 'experience', t.experience, 'isMe', t.user_id = auth.uid(),
      'sports', coalesce((
        SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name, 'durations', sp.class_durations,
                                          'maxStudents', sp.class_max_students) ORDER BY sp.name)
          FROM public.trainer_sports ts JOIN public.sports sp ON sp.id = ts.sport_id
         WHERE ts.trainer_id = t.user_id AND sp.is_active AND sp.classes_enabled), '[]'::json),
      'slots', coalesce((
        SELECT json_agg(json_build_object(
                 'id', s.id, 'dayOfWeek', s.day_of_week, 'startTime', s.start_time, 'endTime', s.end_time,
                 'location', s.location,
                 'finalIndividual', public.trainer_final_rate(s.rate_individual, s.commission_percent),
                 'finalGroup', public.trainer_final_rate(s.rate_group, s.commission_percent),
                 'sports', coalesce((SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name) ORDER BY sp.name)
                                       FROM public.trainer_slot_sports ss JOIN public.sports sp ON sp.id = ss.sport_id
                                      WHERE ss.slot_id = s.id AND sp.is_active AND sp.classes_enabled), '[]'::json))
               ORDER BY s.day_of_week, s.start_time)
          FROM public.trainer_slots s WHERE s.trainer_id = t.user_id AND s.is_active), '[]'::json)
    )
      FROM public.trainers t JOIN public.profiles p ON p.id = t.user_id
     WHERE t.user_id = p_trainer
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. Reservar (Req. 7): todo o nada. Lo llama la Edge Function con el usuario autenticado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_class(
  p_user uuid, p_trainer uuid, p_sport uuid, p_start timestamptz, p_hours int, p_expected bigint, p_by uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o         record;
  v_class   uuid;
  v_taken   int;
  v_cap     int;
  v_balance bigint;
  v_id      uuid;
BEGIN
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
  IF public.ar_date(p_start) > public.ar_date(now()) + 30 THEN
    RAISE EXCEPTION 'Las clases se reservan hasta 30 días hacia adelante' USING ERRCODE = 'TR002';
  END IF;

  -- Serializa las reservas del mismo entrenador: la disponibilidad se evalúa sin carreras (2.3)
  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-classes:' || p_trainer::text, 0));

  SELECT * INTO o FROM public.class_options(p_trainer, public.ar_date(p_start), p_sport, p_hours, p_user) x
   WHERE x.start_at = p_start;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro.' USING ERRCODE = 'TR004';
  END IF;
  IF o.already THEN
    RAISE EXCEPTION 'Ya tenés un lugar en esta clase' USING ERRCODE = 'TR004';
  END IF;
  IF p_expected IS NOT NULL AND p_expected <> o.total THEN
    RAISE EXCEPTION 'El precio de esta clase cambió a % créditos. Revisalo antes de confirmar.', public.fmt_points(o.total)
      USING ERRCODE = 'WL002', DETAIL = json_build_object('total', o.total)::text;
  END IF;

  -- Falla rápido si no alcanza el saldo (antes de ocupar el lugar)
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance < o.total THEN
    RAISE EXCEPTION 'Saldo insuficiente: necesitás % créditos y tenés %. Te faltan %.',
      public.fmt_points(o.total), public.fmt_points(v_balance), public.fmt_points(o.total - v_balance)
      USING ERRCODE = 'WL001',
            DETAIL = json_build_object('needed', o.total, 'available', v_balance, 'missing', o.total - v_balance)::text;
  END IF;

  IF o.class_id IS NULL THEN
    INSERT INTO public.trainer_classes (trainer_id, sport_id, slot_id, start_datetime, end_datetime, hours,
                                        is_group, capacity, location)
    VALUES (p_trainer, p_sport, o.slot_id, o.start_at, o.end_at, p_hours, o.is_group, o.capacity, o.location)
    RETURNING id INTO v_class;
  ELSE
    -- Cupo (7.3): con la fila de la clase bloqueada
    SELECT capacity INTO v_cap FROM public.trainer_classes WHERE id = o.class_id AND status = 'OPEN' FOR UPDATE;
    SELECT count(*) INTO v_taken FROM public.class_bookings WHERE class_id = o.class_id AND status <> 'CANCELLED';
    IF v_cap IS NULL OR v_taken >= v_cap THEN
      RAISE EXCEPTION 'La clase se llenó. Elegí otro horario.' USING ERRCODE = 'TR004';
    END IF;
    v_class := o.class_id;
  END IF;

  INSERT INTO public.class_bookings (class_id, user_id, status, payment_status, paid_at,
                                     base_price, commission_amount, total_price, created_by)
  VALUES (v_class, p_user, 'CONFIRMED', 'PAID', now(), o.base, o.commission, o.total, p_by)
  RETURNING id INTO v_id;

  PERFORM public.wallet_apply_class(p_user, 'BOOKING_PAYMENT', -o.total, v_id,
    'Reserva — ' || public.class_label(v_class), p_by);

  RETURN json_build_object('classBookingId', v_id, 'classId', v_class, 'total', o.total);
END;
$$;

-- ------------------------------------------------------------
-- 6. Cancelar (Req. 9). La base decide el rol de quien cancela:
--    su propia reserva -> reglas de cliente (24 h); el entrenador de la clase o el admin general ->
--    en cualquier momento, con motivo. Devuelve el 100% de lo pagado en la misma transacción.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_actor_role(p_by uuid, p_owner uuid, p_trainer uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_by = p_owner THEN 'CLIENT'
    WHEN p_by = p_trainer AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_by AND role = 'TRAINER' AND is_active) THEN 'TRAINER'
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_by AND role = 'ADMIN' AND is_active) THEN 'ADMIN'
  END;
$$;

-- Si la clase quedó sin alumnos, se libera el horario
CREATE OR REPLACE FUNCTION public.close_empty_class(p_class uuid, p_by uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.trainer_classes
     SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = p_by,
         cancellation_reason = 'Sin alumnos', updated_at = now()
   WHERE id = p_class AND status = 'OPEN'
     AND NOT EXISTS (SELECT 1 FROM public.class_bookings WHERE class_id = p_class AND status <> 'CANCELLED');
$$;

-- Cancela una reserva ya bloqueada y devuelve lo pagado. Uso interno.
CREATE OR REPLACE FUNCTION public.class_booking_do_cancel(p_id uuid, p_by uuid, p_role text, p_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user   uuid;
  v_class  uuid;
  v_paid   bigint;
BEGIN
  UPDATE public.class_bookings
     SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = p_by, cancelled_by_role = p_role,
         cancellation_reason = NULLIF(btrim(p_reason), ''), updated_at = now()
   WHERE id = p_id
   RETURNING user_id, class_id INTO v_user, v_class;

  SELECT -amount INTO v_paid FROM public.wallet_transactions WHERE class_booking_id = p_id AND kind = 'BOOKING_PAYMENT';
  IF v_paid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE class_booking_id = p_id AND kind = 'BOOKING_REFUND') THEN
    PERFORM public.wallet_apply_class(v_user, 'BOOKING_REFUND', v_paid, p_id,
      'Devolución — ' || public.class_label(v_class), p_by);
    RETURN v_paid;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_class_booking(p_id uuid, p_by uuid, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cb       public.class_bookings%ROWTYPE;
  c        public.trainer_classes%ROWTYPE;
  v_role   text;
  v_refund bigint;
BEGIN
  SELECT * INTO cb FROM public.class_bookings WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'WL005';
  END IF;
  SELECT * INTO c FROM public.trainer_classes WHERE id = cb.class_id FOR UPDATE;

  v_role := public.class_actor_role(p_by, cb.user_id, c.trainer_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  IF cb.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'La reserva ya está cancelada' USING ERRCODE = 'WL004';
  END IF;
  IF cb.status = 'COMPLETED' OR c.end_datetime <= now() THEN
    RAISE EXCEPTION 'No se puede cancelar una clase que ya terminó' USING ERRCODE = 'WL004';
  END IF;
  IF v_role = 'CLIENT' AND c.start_datetime - now() < interval '24 hours' THEN
    RAISE EXCEPTION 'Solo podés cancelar hasta 24 horas antes del inicio de la clase' USING ERRCODE = 'WL004';
  END IF;
  IF v_role <> 'CLIENT' AND char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 300 THEN
    RAISE EXCEPTION 'El motivo puede tener hasta 300 caracteres' USING ERRCODE = 'WL006';
  END IF;

  v_refund := public.class_booking_do_cancel(p_id, p_by, v_role, p_reason);
  PERFORM public.close_empty_class(c.id, p_by);

  RETURN json_build_object('cancelled', true, 'refunded', v_refund, 'role', v_role,
                           'userId', cb.user_id, 'classId', c.id, 'trainerId', c.trainer_id);
END;
$$;

-- El entrenador (o el admin general) cancela la clase entera: todas sus reservas, con devolución
CREATE OR REPLACE FUNCTION public.cancel_trainer_class(p_class uuid, p_by uuid, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        public.trainer_classes%ROWTYPE;
  v_role   text;
  r        record;
  v_items  json[] := '{}';
  v_refund bigint;
BEGIN
  SELECT * INTO c FROM public.trainer_classes WHERE id = p_class FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'WL005';
  END IF;
  -- Sin dueño: nunca devuelve CLIENT
  v_role := public.class_actor_role(p_by, NULL, c.trainer_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'WL003';
  END IF;
  IF c.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'La clase ya está cancelada' USING ERRCODE = 'WL004';
  END IF;
  IF c.status = 'COMPLETED' OR c.end_datetime <= now() THEN
    RAISE EXCEPTION 'No se puede cancelar una clase que ya terminó' USING ERRCODE = 'WL004';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'WL006';
  END IF;

  FOR r IN SELECT id, user_id FROM public.class_bookings
            WHERE class_id = c.id AND status <> 'CANCELLED' ORDER BY created_at FOR UPDATE
  LOOP
    v_refund := public.class_booking_do_cancel(r.id, p_by, v_role, p_reason);
    v_items := v_items || json_build_object('id', r.id, 'userId', r.user_id, 'refunded', v_refund);
  END LOOP;

  UPDATE public.trainer_classes
     SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = p_by,
         cancellation_reason = btrim(p_reason), updated_at = now()
   WHERE id = c.id;

  RETURN json_build_object('cancelled', true, 'role', v_role, 'classId', c.id, 'trainerId', c.trainer_id,
                           'bookings', to_json(v_items));
END;
$$;

-- ------------------------------------------------------------
-- 7. Listados
-- ------------------------------------------------------------
-- JSON de una clase con lo que corresponde a cada rol. p_view: 'CLIENT' | 'TRAINER' | 'ADMIN'
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
               'status', cb.status, 'paymentStatus', cb.payment_status,
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

-- Cliente: sus reservas de clase. p_scope: 'UPCOMING' (vigentes, no terminadas) | 'HISTORY'
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
                 'cancelledAt', x.cancelled_at, 'cancelledByRole', x.cancelled_by_role,
                 'cancellationReason', x.cancellation_reason, 'createdAt', x.created_at,
                 'canCancel', x.status = 'CONFIRMED' AND x.start_datetime - now() >= interval '24 hours',
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

-- Entrenador: sus clases. p_scope: 'UPCOMING' (abiertas, no terminadas) | 'HISTORY'
CREATE OR REPLACE FUNCTION public.trainer_my_classes(p_scope text DEFAULT 'UPCOMING', p_page int DEFAULT 1, p_size int DEFAULT 20)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := public.require_trainer();
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_up   boolean := coalesce(p_scope, 'UPCOMING') = 'UPCOMING';
BEGIN
  RETURN (
    WITH f AS (
      SELECT c.id, c.start_datetime FROM public.trainer_classes c
       WHERE c.trainer_id = v_me
         AND CASE WHEN v_up THEN c.status = 'OPEN' AND c.end_datetime > now()
                  ELSE NOT (c.status = 'OPEN' AND c.end_datetime > now()) END
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(public.class_json(x.id, 'TRAINER')
               ORDER BY CASE WHEN v_up THEN x.start_datetime END ASC, CASE WHEN NOT v_up THEN x.start_datetime END DESC)
          FROM (SELECT * FROM f
                 ORDER BY CASE WHEN v_up THEN start_datetime END ASC, CASE WHEN NOT v_up THEN start_datetime END DESC, id
                 LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- Admin general: todas las clases (Req. 11.2). p_status: 'ALL' | 'UPCOMING' | 'DONE' | 'CANCELLED'
CREATE OR REPLACE FUNCTION public.admin_classes(
  p_trainer uuid DEFAULT NULL, p_sport uuid DEFAULT NULL, p_from text DEFAULT NULL, p_to text DEFAULT NULL,
  p_status text DEFAULT 'ALL', p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz := public.ar_day_start(p_from);
  v_to   timestamptz := public.ar_day_start(p_to) + interval '1 day';
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_st   text := coalesce(p_status, 'ALL');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'TR001';
  END IF;
  IF v_st NOT IN ('ALL', 'UPCOMING', 'DONE', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estado inválido' USING ERRCODE = 'TR002';
  END IF;
  RETURN (
    WITH f AS (
      SELECT c.id, c.start_datetime FROM public.trainer_classes c
       WHERE (p_trainer IS NULL OR c.trainer_id = p_trainer)
         AND (p_sport IS NULL OR c.sport_id = p_sport)
         AND (v_from IS NULL OR c.start_datetime >= v_from)
         AND (v_to   IS NULL OR c.start_datetime <  v_to)
         AND CASE v_st
               WHEN 'UPCOMING'  THEN c.status = 'OPEN' AND c.end_datetime > now()
               WHEN 'DONE'      THEN c.status <> 'CANCELLED' AND c.end_datetime <= now()
               WHEN 'CANCELLED' THEN c.status = 'CANCELLED'
               ELSE true END
    )
    SELECT json_build_object(
      'total', (SELECT count(*) FROM f),
      'items', coalesce((
        SELECT json_agg(public.class_json(x.id, 'ADMIN') ORDER BY x.start_datetime DESC)
          FROM (SELECT * FROM f ORDER BY start_datetime DESC, id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- Lista de entrenadores del admin (065) + clases y cancelaciones (Req. 11.1, E20)
CREATE OR REPLACE FUNCTION public.admin_trainers(
  p_search text DEFAULT NULL, p_status text DEFAULT 'ALL', p_page int DEFAULT 1, p_size int DEFAULT 20
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_size int := least(greatest(coalesce(p_size, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_q    text := NULLIF(btrim(left(coalesce(p_search, ''), 100)), '');
  v_like text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'TR001';
  END IF;
  IF coalesce(p_status, 'ALL') NOT IN ('ALL', 'DRAFT', 'PUBLISHED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'Estado inválido' USING ERRCODE = 'TR002';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  RETURN (
    WITH f AS (
      SELECT t.user_id, t.status, t.created_at, p.first_name, p.last_name, p.email, p.phone, p.dni, p.role, p.is_active
        FROM public.trainers t JOIN public.profiles p ON p.id = t.user_id
       WHERE (coalesce(p_status, 'ALL') = 'ALL' OR t.status::text = p_status)
         AND (v_like IS NULL
              OR (p.first_name || ' ' || p.last_name) ILIKE v_like
              OR p.email ILIKE v_like OR coalesce(p.dni, '') ILIKE v_like)
    )
    SELECT json_build_object(
      'total',  (SELECT count(*) FROM f),
      'counts', (SELECT json_build_object(
                   'ALL', count(*),
                   'DRAFT', count(*) FILTER (WHERE status = 'DRAFT'),
                   'PUBLISHED', count(*) FILTER (WHERE status = 'PUBLISHED'),
                   'SUSPENDED', count(*) FILTER (WHERE status = 'SUSPENDED'))
                   FROM public.trainers),
      'items', coalesce((
        SELECT json_agg(json_build_object(
                 'trainerId', x.user_id, 'firstName', x.first_name, 'lastName', x.last_name,
                 'email', x.email, 'phone', x.phone, 'dni', x.dni, 'status', x.status,
                 'isTrainerRole', x.role = 'TRAINER', 'isActive', x.is_active, 'createdAt', x.created_at,
                 'sports', coalesce((SELECT json_agg(sp.name ORDER BY sp.name) FROM public.trainer_sports ts
                                       JOIN public.sports sp ON sp.id = ts.sport_id WHERE ts.trainer_id = x.user_id), '[]'::json),
                 'slotsCount', (SELECT count(*) FROM public.trainer_slots s WHERE s.trainer_id = x.user_id AND s.is_active),
                 'minRate', (SELECT min(s.rate_individual) FROM public.trainer_slots s WHERE s.trainer_id = x.user_id AND s.is_active),
                 'classesCount', (SELECT count(*) FROM public.trainer_classes c
                                   WHERE c.trainer_id = x.user_id AND c.status <> 'CANCELLED'),
                 'cancelledByTrainer', (SELECT count(*) FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
                                         WHERE c.trainer_id = x.user_id AND cb.cancelled_by_role = 'TRAINER'),
                 'cancelledByClients', (SELECT count(*) FROM public.class_bookings cb JOIN public.trainer_classes c ON c.id = cb.class_id
                                         WHERE c.trainer_id = x.user_id AND cb.cancelled_by_role = 'CLIENT'))
               ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC, user_id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- 8. Bloqueos con clases reservadas (Req. 4.8, E16): se rechaza e indica cuáles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trainer_add_block(p_start text, p_end text, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      uuid := public.require_trainer();
  v_today   date := public.ar_date(now());
  v_from    date;
  v_to      date;
  v_classes text;
BEGIN
  BEGIN
    v_from := p_start::date;
    v_to   := coalesce(NULLIF(p_end, ''), p_start)::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = 'TR002';
  END;
  IF v_from < v_today THEN
    RAISE EXCEPTION 'No se pueden bloquear días que ya pasaron' USING ERRCODE = 'TR002';
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la de inicio' USING ERRCODE = 'TR002';
  END IF;
  IF v_to > (v_today + interval '2 years')::date THEN
    RAISE EXCEPTION 'Podés bloquear hasta 2 años hacia adelante' USING ERRCODE = 'TR002';
  END IF;
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 200 THEN
    RAISE EXCEPTION 'El motivo puede tener hasta 200 caracteres' USING ERRCODE = 'TR002';
  END IF;

  -- Mismo lock que las reservas: nadie reserva en esos días mientras se bloquean
  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-classes:' || v_me::text, 0));
  SELECT string_agg(public.fmt_ar_datetime(c.start_datetime), ', ' ORDER BY c.start_datetime) INTO v_classes
    FROM public.trainer_classes c
   WHERE c.trainer_id = v_me AND c.status = 'OPEN'
     AND public.ar_date(c.start_datetime) <= v_to
     AND public.ar_date(c.end_datetime - interval '1 second') >= v_from;
  IF v_classes IS NOT NULL THEN
    RAISE EXCEPTION 'Tenés clases reservadas esos días (%). Cancelalas primero desde Mis clases.', v_classes
      USING ERRCODE = 'TR004';
  END IF;

  INSERT INTO public.trainer_blocks (trainer_id, start_date, end_date, reason)
  VALUES (v_me, v_from, v_to, NULLIF(btrim(p_reason), ''));
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- ------------------------------------------------------------
-- 9. Permisos
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.class_label(uuid)                                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_apply_class(uuid, public.wallet_tx_kind, bigint, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_options(uuid, date, uuid, int, uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_actor_role(uuid, uuid, uuid)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_empty_class(uuid, uuid)                                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_booking_do_cancel(uuid, uuid, text, text)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_json(uuid, text)                                         FROM PUBLIC, anon, authenticated;

-- Las que mueven créditos: solo las Edge Functions (service_role), con el usuario autenticado
REVOKE ALL ON FUNCTION public.book_class(uuid, uuid, uuid, timestamptz, int, bigint, uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_class_booking(uuid, uuid, text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_trainer_class(uuid, uuid, text)                         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, uuid, uuid, timestamptz, int, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_class_booking(uuid, uuid, text)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_trainer_class(uuid, uuid, text)                      TO service_role;

-- Públicas (perfiles publicados y horarios libres)
REVOKE ALL ON FUNCTION public.trainer_availability(uuid, text, uuid, int)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_trainers(uuid, int, bigint, bigint, int, int)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trainer_public_profile(uuid)                                   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trainer_availability(uuid, text, uuid, int)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_trainers(uuid, int, bigint, bigint, int, int)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_public_profile(uuid)                                TO anon, authenticated;

-- Listados: validan el rol adentro
REVOKE ALL ON FUNCTION public.my_class_bookings(text, int, int)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_my_classes(text, int, int)                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_classes(uuid, uuid, text, text, text, int, int)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_class_bookings(text, int, int)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_my_classes(text, int, int)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_classes(uuid, uuid, text, text, text, int, int)       TO authenticated;

NOTIFY pgrst, 'reload schema';
