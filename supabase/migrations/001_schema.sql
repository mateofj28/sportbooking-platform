-- ============================================================
-- SportBooking — Schema completo
-- Migración: 001_schema.sql
-- Aplicar en orden: enums → tablas → índices
-- Idempotente: usa IF NOT EXISTS en todos los objetos
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.role AS ENUM ('CLIENT', 'ADMIN', 'VENUE_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('PENDING', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_type AS ENUM ('PER_SESSION', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'BOOKING_CREATED',
    'BOOKING_PAID',
    'BOOKING_CANCELLED',
    'BOOKING_AUTO_CANCELLED',
    'RECURRING_CREATED',
    'NEW_CLIENT',
    'COMMISSION_EARNED',
    'VENUE_OR_FACILITY_CREATED',
    'USER_REGISTERED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLAS (en orden de dependencia)
-- ============================================================

-- 1. venues (no depende de nadie excepto profiles que viene después,
--    pero la FK hacia profiles se agrega al final)
CREATE TABLE IF NOT EXISTS public.venues (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  description text,
  address     text        NOT NULL,
  city        text        NOT NULL,
  state       text,
  country     text        NOT NULL,
  latitude    numeric(10,8),
  longitude   numeric(11,8),
  phone       text,
  email       text,
  image_url   text,
  amenities   text[]      NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. sports
CREATE TABLE IF NOT EXISTS public.sports (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text         NOT NULL UNIQUE,
  description  text,
  max_players  int,
  billing_type public.billing_type NOT NULL DEFAULT 'PER_SESSION',
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- 3. profiles (extiende auth.users; id = auth.users.id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  text        NOT NULL DEFAULT '',
  last_name   text        NOT NULL DEFAULT '',
  phone       text,
  dni         text        UNIQUE,
  avatar_url  text,
  role        public.role NOT NULL DEFAULT 'CLIENT',
  venue_id    uuid        REFERENCES public.venues(id) ON DELETE SET NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. venue_sports (M:N)
CREATE TABLE IF NOT EXISTS public.venue_sports (
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id, sport_id)
);

-- 5. facilities
CREATE TABLE IF NOT EXISTS public.facilities (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id             uuid        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sport_id             uuid        NOT NULL REFERENCES public.sports(id),
  name                 text        NOT NULL,
  description          text,
  image_url            text,
  surface_type         text,
  is_indoor            boolean     NOT NULL DEFAULT false,
  capacity             int,
  is_active            boolean     NOT NULL DEFAULT true,
  min_booking_duration int         NOT NULL,  -- minutos
  max_booking_duration int         NOT NULL,  -- minutos
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 6. schedules (horarios por cancha y día de semana)
--    day_of_week: 0=Lunes … 6=Domingo (consistente con el negocio AR)
CREATE TABLE IF NOT EXISTS public.schedules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  day_of_week int         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   text        NOT NULL,  -- "HH:MM"
  close_time  text        NOT NULL,  -- "HH:MM"
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 7. pricing (tarifas por cancha, día y franja horaria)
--    NOTA: price_per_hour es el precio FIJO DEL TURNO, no por hora.
--          El nombre es heredado del sistema anterior.
CREATE TABLE IF NOT EXISTS public.pricing (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   uuid           NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  day_of_week   int            CHECK (day_of_week BETWEEN 0 AND 6),  -- NULL = todos los días
  start_time    text           NOT NULL,  -- "HH:MM"
  end_time      text           NOT NULL,  -- "HH:MM"
  price_per_hour numeric(10,2) NOT NULL,  -- precio del turno (fixed, no por hora)
  profit_percent numeric(5,2)  NOT NULL DEFAULT 0,  -- % comisión de la empresa
  currency      text           NOT NULL DEFAULT 'ARS',
  is_active     boolean        NOT NULL DEFAULT true,
  created_at    timestamptz    NOT NULL DEFAULT now(),
  updated_at    timestamptz    NOT NULL DEFAULT now()
);

-- 8. blocked_slots (bloqueos manuales de horario)
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    uuid        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime   timestamptz NOT NULL,
  reason         text,
  created_by     uuid        NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_slots_start_before_end CHECK (end_datetime > start_datetime)
);

-- 9. recurring_bookings (turnos fijos semanales)
CREATE TABLE IF NOT EXISTS public.recurring_bookings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id),
  day_of_week int         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  text        NOT NULL,  -- "HH:MM" en hora Argentina (UTC-3)
  end_time    text        NOT NULL,  -- "HH:MM" en hora Argentina (UTC-3)
  start_date  timestamptz NOT NULL,
  end_date    timestamptz NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 10. bookings (reservas individuales)
CREATE TABLE IF NOT EXISTS public.bookings (
  id                  uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         uuid                 NOT NULL REFERENCES public.facilities(id),
  user_id             uuid                 NOT NULL REFERENCES public.profiles(id),
  start_datetime      timestamptz          NOT NULL,
  end_datetime        timestamptz          NOT NULL,
  status              public.booking_status NOT NULL DEFAULT 'CONFIRMED',
  payment_status      public.payment_status NOT NULL DEFAULT 'PENDING',
  paid_at             timestamptz,
  reminder_sent_at    timestamptz,                   -- idempotencia de recordatorios
  total_price         numeric(10,2)        NOT NULL,  -- base + comisión
  base_price          numeric(10,2)        NOT NULL DEFAULT 0,  -- ganancia del complejo
  commission_amount   numeric(10,2)        NOT NULL DEFAULT 0,  -- comisión de la empresa
  currency            text                 NOT NULL DEFAULT 'ARS',
  notes               text,
  cancelled_at        timestamptz,
  cancelled_by        uuid                 REFERENCES public.profiles(id),
  cancellation_reason text,
  created_by          uuid                 NOT NULL REFERENCES public.profiles(id),
  recurring_booking_id uuid               REFERENCES public.recurring_bookings(id) ON DELETE SET NULL,
  created_at          timestamptz          NOT NULL DEFAULT now(),
  updated_at          timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT bookings_start_before_end CHECK (end_datetime > start_datetime),
  CONSTRAINT bookings_prices_positive   CHECK (total_price >= 0 AND base_price >= 0 AND commission_amount >= 0)
);

-- 11. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  type       public.notification_type   NOT NULL,
  title      text                       NOT NULL,
  body       text                       NOT NULL,
  venue_id   uuid                       REFERENCES public.venues(id) ON DELETE CASCADE,  -- NULL = global/adminOnly
  admin_only boolean                    NOT NULL DEFAULT false,
  booking_id uuid,                               -- referencia de contexto (no FK dura para no bloquear borrados)
  data       jsonb,                              -- datos serializados para render sin joins
  created_at timestamptz                NOT NULL DEFAULT now()
);

-- 12. notification_reads (lecturas POR USUARIO — estado independiente por persona)
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid        NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_reads_unique UNIQUE (notification_id, user_id)
);

-- ============================================================
-- ÍNDICES (para performance en queries frecuentes)
-- ============================================================

-- bookings: consultas por usuario, por cancha, por estado y por fecha
CREATE INDEX IF NOT EXISTS idx_bookings_user_id         ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_facility_id     ON public.bookings(facility_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status          ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status  ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_datetime  ON public.bookings(start_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_end_datetime    ON public.bookings(end_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_recurring       ON public.bookings(recurring_booking_id)
  WHERE recurring_booking_id IS NOT NULL;

-- Crons: encontrar turnos impagas o por completar rápido
CREATE INDEX IF NOT EXISTS idx_bookings_cron_cancel ON public.bookings(start_datetime)
  WHERE status = 'CONFIRMED' AND payment_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_bookings_cron_complete ON public.bookings(end_datetime)
  WHERE status = 'CONFIRMED' AND payment_status = 'PAID';
CREATE INDEX IF NOT EXISTS idx_bookings_cron_reminder ON public.bookings(start_datetime)
  WHERE status = 'CONFIRMED' AND payment_status = 'PAID' AND reminder_sent_at IS NULL;

-- facilities: búsquedas por sede, deporte y estado
CREATE INDEX IF NOT EXISTS idx_facilities_venue_id  ON public.facilities(venue_id);
CREATE INDEX IF NOT EXISTS idx_facilities_sport_id  ON public.facilities(sport_id);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON public.facilities(is_active);

-- schedules: buscar horario activo por cancha y día
CREATE INDEX IF NOT EXISTS idx_schedules_facility_day ON public.schedules(facility_id, day_of_week)
  WHERE is_active = true;

-- pricing: buscar tarifa activa por cancha y día
CREATE INDEX IF NOT EXISTS idx_pricing_facility_active ON public.pricing(facility_id, day_of_week)
  WHERE is_active = true;

-- blocked_slots: buscar bloqueos por cancha y ventana de tiempo
CREATE INDEX IF NOT EXISTS idx_blocked_slots_facility_time
  ON public.blocked_slots(facility_id, start_datetime, end_datetime);

-- recurring_bookings: por usuario y cancha
CREATE INDEX IF NOT EXISTS idx_recurring_user_id     ON public.recurring_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_facility_id ON public.recurring_bookings(facility_id);

-- notifications: queries del centro de notificaciones
CREATE INDEX IF NOT EXISTS idx_notifications_venue_created  ON public.notifications(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_admin_created  ON public.notifications(admin_only, created_at DESC)
  WHERE admin_only = true;

-- notification_reads: buscar qué leyó un usuario
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON public.notification_reads(user_id);

-- profiles: buscar admins por sede
CREATE INDEX IF NOT EXISTS idx_profiles_venue_id ON public.profiles(venue_id)
  WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
