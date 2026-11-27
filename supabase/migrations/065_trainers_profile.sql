-- ============================================================
-- 065 · Entrenadores — Etapa 1: perfil, franjas, bloqueos, publicación y control del admin
-- Spec: .kiro/specs/entrenadores (Req. 1, 2, 3, 4, 11.1, 13; E5, E7, E9, E17, E22)
--
-- Todo lo que escribe el entrenador pasa por funciones (sin INSERT/UPDATE directos): así las
-- validaciones (franjas superpuestas, deportes válidos, tarifa grupal, comisión) viven en un
-- solo lugar y no se pueden saltear por la API. La comisión solo la cambia el admin general.
-- El admin de sede no ve nada de entrenadores (E22): ninguna política lo incluye.
-- Días: 0 = lunes … 6 = domingo (igual que schedules). Horas "HH:MM" en hora de Argentina.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Configuración de clases por deporte (Req. 1) — la edita el admin general (RLS de sports)
-- ------------------------------------------------------------
ALTER TABLE public.sports
  ADD COLUMN IF NOT EXISTS classes_enabled    boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS class_durations    smallint[] NOT NULL DEFAULT '{1}',
  ADD COLUMN IF NOT EXISTS class_max_students smallint   NOT NULL DEFAULT 1;

ALTER TABLE public.sports DROP CONSTRAINT IF EXISTS sports_class_durations_valid;
ALTER TABLE public.sports ADD CONSTRAINT sports_class_durations_valid
  CHECK (cardinality(class_durations) BETWEEN 1 AND 8 AND class_durations <@ '{1,2,3,4,5,6,7,8}'::smallint[]);
ALTER TABLE public.sports DROP CONSTRAINT IF EXISTS sports_class_max_students_valid;
ALTER TABLE public.sports ADD CONSTRAINT sports_class_max_students_valid
  CHECK (class_max_students BETWEEN 1 AND 50);

-- ------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.trainer_status AS ENUM ('DRAFT', 'PUBLISHED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.trainers (
  user_id          uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status           public.trainer_status NOT NULL DEFAULT 'DRAFT',
  bio              text CHECK (bio IS NULL OR char_length(bio) <= 300),
  experience       text CHECK (experience IS NULL OR char_length(experience) <= 1000),
  published_at     timestamptz,
  suspended_at     timestamptz,
  suspended_reason text CHECK (suspended_reason IS NULL OR char_length(btrim(suspended_reason)) BETWEEN 3 AND 300),
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainers_suspension_shape CHECK (
    (status = 'SUSPENDED') = (suspended_at IS NOT NULL AND suspended_reason IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_trainers_status ON public.trainers(status);

CREATE TABLE IF NOT EXISTS public.trainer_sports (
  trainer_id uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE CASCADE,
  sport_id   uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  PRIMARY KEY (trainer_id, sport_id)
);
CREATE INDEX IF NOT EXISTS idx_trainer_sports_sport ON public.trainer_sports(sport_id);

CREATE TABLE IF NOT EXISTS public.trainer_slots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE CASCADE,
  day_of_week        smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time         text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time           text NOT NULL CHECK (end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location           text NOT NULL CHECK (char_length(btrim(location)) BETWEEN 1 AND 200),
  rate_individual    integer NOT NULL CHECK (rate_individual BETWEEN 1 AND 10000000),
  rate_group         integer CHECK (rate_group IS NULL OR rate_group BETWEEN 1 AND 10000000),
  commission_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_percent BETWEEN 1 AND 100),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_slots_not_empty CHECK (start_time <> end_time)
);
CREATE INDEX IF NOT EXISTS idx_trainer_slots_trainer ON public.trainer_slots(trainer_id, day_of_week);

CREATE TABLE IF NOT EXISTS public.trainer_slot_sports (
  slot_id  uuid NOT NULL REFERENCES public.trainer_slots(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  PRIMARY KEY (slot_id, sport_id)
);

CREATE TABLE IF NOT EXISTS public.trainer_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(user_id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  reason     text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_blocks_range CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_trainer_blocks_trainer ON public.trainer_blocks(trainer_id, start_date);

-- ------------------------------------------------------------
-- 3. RLS: lectura por rol; nadie escribe directo (todo por las funciones de abajo)
-- ------------------------------------------------------------
ALTER TABLE public.trainers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_sports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_slots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_slot_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_blocks      ENABLE ROW LEVEL SECURITY;

-- ¿El entrenador está visible para los clientes?
CREATE OR REPLACE FUNCTION public.trainer_is_public(p_trainer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trainers t JOIN public.profiles p ON p.id = t.user_id
     WHERE t.user_id = p_trainer AND t.status = 'PUBLISHED' AND p.role = 'TRAINER' AND p.is_active
  );
$$;

DROP POLICY IF EXISTS trainers_select ON public.trainers;
CREATE POLICY trainers_select ON public.trainers FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin() OR public.trainer_is_public(user_id));

DROP POLICY IF EXISTS trainer_sports_select ON public.trainer_sports;
CREATE POLICY trainer_sports_select ON public.trainer_sports FOR SELECT
  USING (trainer_id = auth.uid() OR public.is_admin() OR public.trainer_is_public(trainer_id));

DROP POLICY IF EXISTS trainer_slots_select ON public.trainer_slots;
CREATE POLICY trainer_slots_select ON public.trainer_slots FOR SELECT
  USING (trainer_id = auth.uid() OR public.is_admin() OR (is_active AND public.trainer_is_public(trainer_id)));

DROP POLICY IF EXISTS trainer_slot_sports_select ON public.trainer_slot_sports;
CREATE POLICY trainer_slot_sports_select ON public.trainer_slot_sports FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.trainer_slots s WHERE s.id = slot_id
                  AND (s.trainer_id = auth.uid() OR public.is_admin() OR (s.is_active AND public.trainer_is_public(s.trainer_id)))));

DROP POLICY IF EXISTS trainer_blocks_select ON public.trainer_blocks;
CREATE POLICY trainer_blocks_select ON public.trainer_blocks FOR SELECT
  USING (trainer_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------
-- 4. Utilidades
-- ------------------------------------------------------------
-- "HH:MM" -> minutos desde la medianoche
CREATE OR REPLACE FUNCTION public.clock_minutes(p text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int;
$$;

-- ¿Se pisan dos franjas semanales? (con cruce de medianoche y de domingo a lunes)
CREATE OR REPLACE FUNCTION public.trainer_slots_overlap(
  d1 smallint, s1 text, e1 text, d2 smallint, s2 text, e2 text
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  a1 int := d1 * 1440 + public.clock_minutes(s1);
  b1 int := d1 * 1440 + public.clock_minutes(e1) + CASE WHEN public.clock_minutes(e1) <= public.clock_minutes(s1) THEN 1440 ELSE 0 END;
  a2 int := d2 * 1440 + public.clock_minutes(s2);
  b2 int := d2 * 1440 + public.clock_minutes(e2) + CASE WHEN public.clock_minutes(e2) <= public.clock_minutes(s2) THEN 1440 ELSE 0 END;
  w  int;
BEGIN
  FOREACH w IN ARRAY ARRAY[-10080, 0, 10080] LOOP
    IF a1 < b2 + w AND a2 + w < b1 THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- El usuario actual tiene que ser un entrenador (rol TRAINER con su fila)
CREATE OR REPLACE FUNCTION public.require_trainer()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() <> 'TRAINER' OR NOT EXISTS (SELECT 1 FROM public.trainers WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo un entrenador puede hacer esto' USING ERRCODE = 'TR001';
  END IF;
  RETURN auth.uid();
END;
$$;

-- Lo que le falta a un entrenador para poder publicarse (Req. 3.2). Vacío = puede.
CREATE OR REPLACE FUNCTION public.trainer_publish_problems(p_trainer uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.trainer_sports WHERE trainer_id = p_trainer)
         THEN 'Elegí al menos un deporte' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.trainer_slots WHERE trainer_id = p_trainer AND is_active)
         THEN 'Cargá al menos una franja de disponibilidad' END,
    CASE WHEN EXISTS (
           SELECT 1 FROM public.trainer_slots s
             JOIN public.trainer_slot_sports ss ON ss.slot_id = s.id
             JOIN public.sports sp ON sp.id = ss.sport_id
            WHERE s.trainer_id = p_trainer AND s.is_active AND sp.class_max_students > 1 AND s.rate_group IS NULL)
         THEN 'Hay franjas con deportes grupales sin tarifa grupal' END,
    CASE WHEN EXISTS (
           SELECT 1 FROM public.trainer_slot_sports ss
             JOIN public.trainer_slots s ON s.id = ss.slot_id
             JOIN public.sports sp ON sp.id = ss.sport_id
            WHERE s.trainer_id = p_trainer AND s.is_active AND NOT sp.classes_enabled)
         THEN 'Hay franjas con deportes que ya no admiten clases' END
  ], NULL);
$$;

-- Ficha completa de un entrenador (la usan su panel y el detalle del admin)
CREATE OR REPLACE FUNCTION public.trainer_panel_json(p_trainer uuid, p_with_commission boolean)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'trainerId',  t.user_id,
    'firstName',  p.first_name, 'lastName', p.last_name, 'email', p.email, 'phone', p.phone,
    'dni',        p.dni, 'avatarUrl', p.avatar_url, 'isActive', p.is_active, 'role', p.role,
    'status',     t.status, 'bio', t.bio, 'experience', t.experience,
    'publishedAt', t.published_at, 'suspendedAt', t.suspended_at, 'suspendedReason', t.suspended_reason,
    'createdAt',  t.created_at,
    'sports', coalesce((SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name,
                         'maxStudents', sp.class_max_students, 'durations', sp.class_durations,
                         'classesEnabled', sp.classes_enabled) ORDER BY sp.name)
                          FROM public.trainer_sports ts JOIN public.sports sp ON sp.id = ts.sport_id
                         WHERE ts.trainer_id = t.user_id), '[]'::json),
    'slots', coalesce((SELECT json_agg(json_build_object(
                         'id', s.id, 'dayOfWeek', s.day_of_week, 'startTime', s.start_time, 'endTime', s.end_time,
                         'location', s.location, 'rateIndividual', s.rate_individual, 'rateGroup', s.rate_group,
                         'commissionPercent', s.commission_percent,
                         -- Precio final por hora que paga el cliente (tarifa + comisión redondeada al peso)
                         'finalIndividual', s.rate_individual + round(s.rate_individual * s.commission_percent / 100),
                         'finalGroup', CASE WHEN s.rate_group IS NOT NULL
                                            THEN s.rate_group + round(s.rate_group * s.commission_percent / 100) END,
                         'isActive', s.is_active,
                         'sports', coalesce((SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name) ORDER BY sp.name)
                                               FROM public.trainer_slot_sports ss JOIN public.sports sp ON sp.id = ss.sport_id
                                              WHERE ss.slot_id = s.id), '[]'::json))
                       ORDER BY s.day_of_week, s.start_time)
                         FROM public.trainer_slots s WHERE s.trainer_id = t.user_id), '[]'::json),
    'blocks', coalesce((SELECT json_agg(json_build_object('id', b.id, 'startDate', b.start_date, 'endDate', b.end_date,
                          'reason', b.reason) ORDER BY b.start_date)
                          FROM public.trainer_blocks b
                         WHERE b.trainer_id = t.user_id
                           AND b.end_date >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date), '[]'::json),
    'publishProblems', to_json(public.trainer_publish_problems(t.user_id)),
    'withCommission', p_with_commission
  )
  FROM public.trainers t JOIN public.profiles p ON p.id = t.user_id
  WHERE t.user_id = p_trainer;
$$;

-- ------------------------------------------------------------
-- 5. Funciones del entrenador
-- ------------------------------------------------------------
-- Panel del entrenador (ve el % de comisión en solo lectura y el precio final)
CREATE OR REPLACE FUNCTION public.trainer_my_panel()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := public.require_trainer();
BEGIN
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- Perfil: descripción, experiencia y deportes (Req. 3.1)
CREATE OR REPLACE FUNCTION public.trainer_upsert_profile(p_bio text, p_experience text, p_sport_ids uuid[])
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := public.require_trainer();
  v_sports uuid[] := coalesce((SELECT array_agg(DISTINCT x) FROM unnest(p_sport_ids) x), '{}');
  v_used   text;
BEGIN
  IF char_length(coalesce(p_bio, '')) > 300 THEN
    RAISE EXCEPTION 'La descripción puede tener hasta 300 caracteres' USING ERRCODE = 'TR002';
  END IF;
  IF char_length(coalesce(p_experience, '')) > 1000 THEN
    RAISE EXCEPTION 'La experiencia puede tener hasta 1000 caracteres' USING ERRCODE = 'TR002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_sports) x LEFT JOIN public.sports sp ON sp.id = x
              WHERE sp.id IS NULL OR NOT sp.classes_enabled OR NOT sp.is_active) THEN
    RAISE EXCEPTION 'Algún deporte elegido no admite clases' USING ERRCODE = 'TR002';
  END IF;
  -- No se puede quitar un deporte que todavía se da en una franja
  SELECT string_agg(DISTINCT sp.name, ', ') INTO v_used
    FROM public.trainer_slot_sports ss
    JOIN public.trainer_slots s ON s.id = ss.slot_id
    JOIN public.sports sp ON sp.id = ss.sport_id
   WHERE s.trainer_id = v_me AND NOT (ss.sport_id = ANY (v_sports));
  IF v_used IS NOT NULL THEN
    RAISE EXCEPTION 'Para quitar % primero sacalo de tus franjas de disponibilidad', v_used USING ERRCODE = 'TR002';
  END IF;

  UPDATE public.trainers
     SET bio = NULLIF(btrim(p_bio), ''), experience = NULLIF(btrim(p_experience), ''), updated_at = now()
   WHERE user_id = v_me;
  DELETE FROM public.trainer_sports WHERE trainer_id = v_me AND NOT (sport_id = ANY (v_sports));
  INSERT INTO public.trainer_sports (trainer_id, sport_id)
  SELECT v_me, x FROM unnest(v_sports) x ON CONFLICT DO NOTHING;

  -- Si quedó sin algo obligatorio y estaba publicado, vuelve a borrador
  IF cardinality(public.trainer_publish_problems(v_me)) > 0 THEN
    UPDATE public.trainers SET status = 'DRAFT', updated_at = now() WHERE user_id = v_me AND status = 'PUBLISHED';
  END IF;
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- Crear o editar una franja (Req. 4.1–4.5). La comisión NO se recibe: la define el admin general.
CREATE OR REPLACE FUNCTION public.trainer_save_slot(
  p_id uuid, p_day smallint, p_start text, p_end text, p_location text,
  p_rate_individual integer, p_rate_group integer, p_sport_ids uuid[]
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := public.require_trainer();
  v_sports uuid[] := coalesce((SELECT array_agg(DISTINCT x) FROM unnest(p_sport_ids) x), '{}');
  v_id     uuid := p_id;
  v_pct    numeric;
  v_clash  record;
BEGIN
  IF p_day IS NULL OR p_day NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'Elegí un día de la semana' USING ERRCODE = 'TR002';
  END IF;
  IF p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_start = p_end THEN
    RAISE EXCEPTION 'Revisá el horario: inicio y fin en formato HH:MM y distintos' USING ERRCODE = 'TR002';
  END IF;
  -- Horas enteras: las clases van en pasos de 1 hora (E11)
  IF split_part(p_start, ':', 2) <> '00' OR split_part(p_end, ':', 2) <> '00' THEN
    RAISE EXCEPTION 'La franja tiene que empezar y terminar en hora en punto (ej. 18:00)' USING ERRCODE = 'TR002';
  END IF;
  IF char_length(btrim(coalesce(p_location, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Indicá dónde se da la clase (hasta 200 caracteres)' USING ERRCODE = 'TR002';
  END IF;
  IF p_rate_individual IS NULL OR p_rate_individual NOT BETWEEN 1 AND 10000000 THEN
    RAISE EXCEPTION 'La tarifa individual tiene que ser mayor que 0' USING ERRCODE = 'TR002';
  END IF;
  IF p_rate_group IS NOT NULL AND p_rate_group NOT BETWEEN 1 AND 10000000 THEN
    RAISE EXCEPTION 'La tarifa grupal tiene que ser mayor que 0' USING ERRCODE = 'TR002';
  END IF;
  IF cardinality(v_sports) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos un deporte para la franja' USING ERRCODE = 'TR002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_sports) x
              WHERE NOT EXISTS (SELECT 1 FROM public.trainer_sports ts WHERE ts.trainer_id = v_me AND ts.sport_id = x)) THEN
    RAISE EXCEPTION 'La franja solo puede tener deportes de tu perfil' USING ERRCODE = 'TR002';
  END IF;
  IF p_rate_group IS NULL AND EXISTS (
       SELECT 1 FROM public.sports sp WHERE sp.id = ANY (v_sports) AND sp.class_max_students > 1) THEN
    RAISE EXCEPTION 'Cargá la tarifa grupal: la franja tiene deportes con clases grupales' USING ERRCODE = 'TR002';
  END IF;
  IF p_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trainer_slots WHERE id = p_id AND trainer_id = v_me) THEN
    RAISE EXCEPTION 'Franja no encontrada' USING ERRCODE = 'TR003';
  END IF;

  -- Serializa los cambios de franjas del mismo entrenador (la superposición se valida sin carreras)
  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-slots:' || v_me::text, 0));
  SELECT s.day_of_week, s.start_time, s.end_time INTO v_clash
    FROM public.trainer_slots s
   WHERE s.trainer_id = v_me AND s.is_active AND s.id IS DISTINCT FROM p_id
     AND public.trainer_slots_overlap(s.day_of_week, s.start_time, s.end_time, p_day, p_start, p_end)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Se pisa con otra franja tuya (% a %)', v_clash.start_time, v_clash.end_time USING ERRCODE = 'TR002';
  END IF;

  IF p_id IS NULL THEN
    -- Comisión: la de su franja más reciente; si no tiene, 10% (el admin general la ajusta)
    SELECT commission_percent INTO v_pct FROM public.trainer_slots
     WHERE trainer_id = v_me ORDER BY updated_at DESC LIMIT 1;
    INSERT INTO public.trainer_slots (trainer_id, day_of_week, start_time, end_time, location,
                                      rate_individual, rate_group, commission_percent)
    VALUES (v_me, p_day, p_start, p_end, btrim(p_location), p_rate_individual, p_rate_group, coalesce(v_pct, 10))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.trainer_slots
       SET day_of_week = p_day, start_time = p_start, end_time = p_end, location = btrim(p_location),
           rate_individual = p_rate_individual, rate_group = p_rate_group, is_active = true, updated_at = now()
     WHERE id = p_id;
    DELETE FROM public.trainer_slot_sports WHERE slot_id = p_id AND NOT (sport_id = ANY (v_sports));
  END IF;
  INSERT INTO public.trainer_slot_sports (slot_id, sport_id)
  SELECT v_id, x FROM unnest(v_sports) x ON CONFLICT DO NOTHING;

  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_delete_slot(p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := public.require_trainer();
BEGIN
  DELETE FROM public.trainer_slots WHERE id = p_id AND trainer_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franja no encontrada' USING ERRCODE = 'TR003';
  END IF;
  IF cardinality(public.trainer_publish_problems(v_me)) > 0 THEN
    UPDATE public.trainers SET status = 'DRAFT', updated_at = now() WHERE user_id = v_me AND status = 'PUBLISHED';
  END IF;
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- Bloqueos (Req. 4.7). Desde la Etapa 2 también rechaza días con clases reservadas (4.8).
CREATE OR REPLACE FUNCTION public.trainer_add_block(p_start text, p_end text, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    uuid := public.require_trainer();
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_from  date;
  v_to    date;
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
  INSERT INTO public.trainer_blocks (trainer_id, start_date, end_date, reason)
  VALUES (v_me, v_from, v_to, NULLIF(btrim(p_reason), ''));
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_delete_block(p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := public.require_trainer();
BEGIN
  DELETE FROM public.trainer_blocks WHERE id = p_id AND trainer_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bloqueo no encontrado' USING ERRCODE = 'TR003';
  END IF;
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- Publicar / despublicar (Req. 3.2–3.3)
CREATE OR REPLACE FUNCTION public.trainer_set_published(p_publish boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       uuid := public.require_trainer();
  v_status   public.trainer_status;
  v_problems text[];
BEGIN
  SELECT status INTO v_status FROM public.trainers WHERE user_id = v_me FOR UPDATE;
  IF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Tu perfil está suspendido por la administración' USING ERRCODE = 'TR004';
  END IF;
  IF p_publish THEN
    v_problems := public.trainer_publish_problems(v_me);
    IF cardinality(v_problems) > 0 THEN
      RAISE EXCEPTION 'Para publicar te falta: %', array_to_string(v_problems, '; ')
        USING ERRCODE = 'TR004', DETAIL = to_json(v_problems)::text;
    END IF;
    UPDATE public.trainers SET status = 'PUBLISHED', published_at = coalesce(published_at, now()), updated_at = now()
     WHERE user_id = v_me;
  ELSE
    UPDATE public.trainers SET status = 'DRAFT', updated_at = now() WHERE user_id = v_me;
  END IF;
  RETURN public.trainer_panel_json(v_me, true);
END;
$$;

-- ------------------------------------------------------------
-- 6. Funciones del admin general
-- ------------------------------------------------------------
-- Suspender (con motivo) o reactivar. Reactivar lo deja en borrador: el entrenador vuelve a publicar.
CREATE OR REPLACE FUNCTION public.admin_set_trainer_status(p_trainer uuid, p_suspend boolean, p_reason text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'TR001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainers WHERE user_id = p_trainer) THEN
    RAISE EXCEPTION 'Entrenador no encontrado' USING ERRCODE = 'TR003';
  END IF;
  IF p_suspend THEN
    IF char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
      RAISE EXCEPTION 'El motivo de la suspensión es obligatorio (entre 3 y 300 caracteres)' USING ERRCODE = 'TR002';
    END IF;
    UPDATE public.trainers SET status = 'SUSPENDED', suspended_at = now(), suspended_reason = btrim(p_reason), updated_at = now()
     WHERE user_id = p_trainer;
  ELSE
    UPDATE public.trainers SET status = 'DRAFT', suspended_at = NULL, suspended_reason = NULL, updated_at = now()
     WHERE user_id = p_trainer AND status = 'SUSPENDED';
  END IF;
  RETURN public.trainer_panel_json(p_trainer, true);
END;
$$;

-- % de comisión de una franja (E17): solo el admin general
CREATE OR REPLACE FUNCTION public.admin_set_slot_commission(p_slot uuid, p_percent numeric)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trainer uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'La comisión la define la administración general' USING ERRCODE = 'TR001';
  END IF;
  IF p_percent IS NULL OR p_percent NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'La comisión tiene que estar entre 1 y 100' USING ERRCODE = 'TR002';
  END IF;
  UPDATE public.trainer_slots SET commission_percent = round(p_percent, 2), updated_at = now()
   WHERE id = p_slot RETURNING trainer_id INTO v_trainer;
  IF v_trainer IS NULL THEN
    RAISE EXCEPTION 'Franja no encontrada' USING ERRCODE = 'TR003';
  END IF;
  RETURN public.trainer_panel_json(v_trainer, true);
END;
$$;

-- Lista de entrenadores para el admin general (Req. 11.1), filtrada y paginada en la base
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
                 'minRate', (SELECT min(s.rate_individual) FROM public.trainer_slots s WHERE s.trainer_id = x.user_id AND s.is_active))
               ORDER BY x.created_at DESC)
          FROM (SELECT * FROM f ORDER BY created_at DESC, user_id LIMIT v_size OFFSET (v_page - 1) * v_size) x
      ), '[]'::json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trainer_detail(p_trainer uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'TR001';
  END IF;
  v := public.trainer_panel_json(p_trainer, true);
  IF v IS NULL THEN
    RAISE EXCEPTION 'Entrenador no encontrado' USING ERRCODE = 'TR003';
  END IF;
  RETURN v;
END;
$$;

-- ------------------------------------------------------------
-- 7. Rol: set_user_role acepta TRAINER y le crea su ficha (borrador). Cambiar el rol no borra nada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id  uuid,
  p_role     text,
  p_venue_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_roles text[] := ARRAY['CLIENT', 'ADMIN', 'VENUE_ADMIN', 'TRAINER'];
BEGIN
  IF NOT (p_role = ANY(v_valid_roles)) THEN
    RAISE EXCEPTION 'Rol inválido: %. Debe ser uno de: %', p_role, array_to_string(v_valid_roles, ', ');
  END IF;
  IF p_role = 'VENUE_ADMIN' AND p_venue_id IS NULL THEN
    RAISE EXCEPTION 'venue_id es requerido para el rol VENUE_ADMIN';
  END IF;
  IF p_role IN ('CLIENT', 'ADMIN', 'TRAINER') THEN
    p_venue_id := NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado en profiles: %', p_user_id;
  END IF;

  UPDATE public.profiles
     SET role = p_role::public.role, venue_id = p_venue_id, updated_at = now()
   WHERE id = p_user_id;

  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role, 'venue_id', p_venue_id::text)
   WHERE id = p_user_id;

  -- Ficha de entrenador (si ya existía, se conserva tal cual: perfil, franjas, historial)
  IF p_role = 'TRAINER' THEN
    INSERT INTO public.trainers (user_id, created_by) VALUES (p_user_id, auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'role', p_role, 'venue_id', p_venue_id);
END;
$$;

-- ------------------------------------------------------------
-- 8. Permisos
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trainer_panel_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trainer_publish_problems(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_trainer()                 FROM PUBLIC, anon, authenticated;
-- La usan las políticas de lectura: tiene que poder ejecutarla cualquiera (solo devuelve sí/no)
GRANT EXECUTE ON FUNCTION public.trainer_is_public(uuid)        TO anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'trainer_my_panel()',
    'trainer_upsert_profile(text, text, uuid[])',
    'trainer_save_slot(uuid, smallint, text, text, text, integer, integer, uuid[])',
    'trainer_delete_slot(uuid)',
    'trainer_add_block(text, text, text)',
    'trainer_delete_block(uuid)',
    'trainer_set_published(boolean)',
    'admin_set_trainer_status(uuid, boolean, text)',
    'admin_set_slot_commission(uuid, numeric)',
    'admin_trainers(text, text, int, int)',
    'admin_trainer_detail(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
