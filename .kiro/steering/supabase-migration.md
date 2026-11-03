# Migración a Supabase — SportBooking

Plataforma de reserva de canchas deportivas. Se migra de NestJS + Prisma + Railway a
**Supabase** como backend completo (Postgres, Auth, Storage, Realtime, Edge Functions).
El frontend Next.js (Vercel) pasa a hablar directamente con Supabase via `@supabase/supabase-js`.

Negocio: Argentina (UTC-3, moneda ARS, español).

## Credenciales del proyecto Supabase

- **Project URL**: `https://olrmhtimfndshayvuowc.supabase.co`
- **Publishable (anon) key**: `sb_publishable_ztbDXP1MdNvclLbQRTan1A_qENN-xuG`
- **Service role key**: pendiente de configurar en variables de entorno de Edge Functions (NUNCA en el frontend)

```ts
// frontend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  'https://olrmhtimfndshayvuowc.supabase.co',
  'sb_publishable_ztbDXP1MdNvclLbQRTan1A_qENN-xuG'
)
```

---

## 1. TABLAS Y SCHEMA

### Enums
```sql
CREATE TYPE role           AS ENUM ('CLIENT', 'ADMIN', 'VENUE_ADMIN');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID');
CREATE TYPE billing_type   AS ENUM ('PER_SESSION', 'MONTHLY');
CREATE TYPE notification_type AS ENUM (
  'BOOKING_CREATED', 'BOOKING_PAID', 'BOOKING_CANCELLED', 'BOOKING_AUTO_CANCELLED',
  'RECURRING_CREATED', 'NEW_CLIENT', 'COMMISSION_EARNED',
  'VENUE_OR_FACILITY_CREATED', 'USER_REGISTERED'
);
```

### Tabla: `profiles` (extiende `auth.users` de Supabase)
> Supabase Auth maneja email/password. Este tabla extiende con los campos extra.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = auth.users.id (FK ON DELETE CASCADE) |
| first_name | text NOT NULL | |
| last_name | text NOT NULL | |
| phone | text | |
| dni | text UNIQUE | |
| avatar_url | text | URL de Supabase Storage |
| role | role DEFAULT 'CLIENT' | |
| venue_id | uuid FK venues | solo VENUE_ADMIN |
| is_active | bool DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `venues` (complejos deportivos)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| name | text NOT NULL | |
| slug | text UNIQUE NOT NULL | |
| description | text | |
| address | text NOT NULL | |
| city | text NOT NULL | |
| state | text | |
| country | text NOT NULL | |
| latitude | numeric(10,8) | |
| longitude | numeric(11,8) | |
| phone | text | |
| email | text | |
| image_url | text | URL de Supabase Storage |
| amenities | text[] DEFAULT '{}' | servicios (Duchas, WiFi, etc.) |
| is_active | bool DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `sports` (deportes)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text UNIQUE NOT NULL | |
| description | text | |
| max_players | int | |
| billing_type | billing_type DEFAULT 'PER_SESSION' | |
| is_active | bool DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `venue_sports` (M:N venues ↔ sports)

| Columna | Tipo | Notas |
|---|---|---|
| venue_id | uuid FK venues ON DELETE CASCADE | |
| sport_id | uuid FK sports ON DELETE CASCADE | |
| PK | (venue_id, sport_id) | |

### Tabla: `facilities` (canchas/instalaciones)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| venue_id | uuid FK venues ON DELETE CASCADE NOT NULL | |
| sport_id | uuid FK sports NOT NULL | |
| name | text NOT NULL | |
| description | text | |
| image_url | text | URL de Supabase Storage |
| surface_type | text | |
| is_indoor | bool DEFAULT false | |
| capacity | int | |
| is_active | bool DEFAULT true | |
| min_booking_duration | int NOT NULL | minutos |
| max_booking_duration | int NOT NULL | minutos |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `schedules` (horarios por cancha y día de semana)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| facility_id | uuid FK facilities ON DELETE CASCADE | |
| day_of_week | int NOT NULL | 0=Lunes … 6=Domingo |
| open_time | text NOT NULL | "HH:MM" |
| close_time | text NOT NULL | "HH:MM" |
| is_active | bool DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `pricing` (tarifas por cancha, día y franja horaria)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| facility_id | uuid FK facilities ON DELETE CASCADE | |
| day_of_week | int | NULL = todos los días |
| start_time | text NOT NULL | "HH:MM" |
| end_time | text NOT NULL | "HH:MM" |
| price_per_hour | numeric(10,2) NOT NULL | Precio del TURNO (no por hora, nombre heredado) |
| profit_percent | numeric(5,2) DEFAULT 0 | % comisión de la empresa |
| currency | text DEFAULT 'ARS' | |
| is_active | bool DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `blocked_slots` (bloqueos manuales de horario)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| facility_id | uuid FK facilities ON DELETE CASCADE | |
| start_datetime | timestamptz NOT NULL | instante UTC |
| end_datetime | timestamptz NOT NULL | instante UTC |
| reason | text | |
| created_by | uuid FK profiles | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `bookings` (reservas individuales)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| facility_id | uuid FK facilities | |
| user_id | uuid FK profiles | cliente dueño |
| start_datetime | timestamptz NOT NULL | instante UTC |
| end_datetime | timestamptz NOT NULL | instante UTC |
| status | booking_status DEFAULT 'CONFIRMED' | |
| payment_status | payment_status DEFAULT 'PENDING' | |
| paid_at | timestamptz | |
| reminder_sent_at | timestamptz | idempotencia de recordatorios |
| total_price | numeric(10,2) NOT NULL | base + comisión |
| base_price | numeric(10,2) DEFAULT 0 | ganancia del complejo |
| commission_amount | numeric(10,2) DEFAULT 0 | comisión de la empresa |
| currency | text DEFAULT 'ARS' | |
| notes | text | |
| cancelled_at | timestamptz | |
| cancelled_by | uuid FK profiles | |
| cancellation_reason | text | |
| created_by | uuid FK profiles | |
| recurring_booking_id | uuid FK recurring_bookings ON DELETE SET NULL | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `recurring_bookings` (turnos fijos semanales)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| facility_id | uuid FK facilities ON DELETE CASCADE | |
| user_id | uuid FK profiles | |
| day_of_week | int NOT NULL | 0=Lunes … 6=Domingo |
| start_time | text NOT NULL | "HH:MM" en hora AR |
| end_time | text NOT NULL | "HH:MM" en hora AR |
| start_date | timestamptz NOT NULL | primera ocurrencia |
| end_date | timestamptz NOT NULL | última ocurrencia |
| is_active | bool DEFAULT true | |
| created_by | uuid FK profiles | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

### Tabla: `notifications`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| type | notification_type NOT NULL | |
| title | text NOT NULL | |
| body | text NOT NULL | |
| venue_id | uuid FK venues ON DELETE CASCADE | NULL = global |
| admin_only | bool DEFAULT false | solo admin general |
| booking_id | uuid | referencia de contexto (no FK dura) |
| data | jsonb | datos serializados para render |
| created_at | timestamptz DEFAULT now() | |
| INDEX | (venue_id, created_at) | |
| INDEX | (admin_only, created_at) | |

### Tabla: `notification_reads` (lecturas POR USUARIO)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| notification_id | uuid FK notifications ON DELETE CASCADE | |
| user_id | uuid FK profiles ON DELETE CASCADE | |
| read_at | timestamptz DEFAULT now() | |
| UNIQUE | (notification_id, user_id) | idempotente |
| INDEX | (user_id) | |

---

## 2. AUTENTICACIÓN Y ROLES

### Supabase Auth
- Supabase Auth maneja `email + password`. Los usuarios se crean en `auth.users`.
- La tabla `profiles` se crea automáticamente vía trigger `on_auth_user_created` al registrarse.
- El JWT de Supabase incluye `user_metadata` con `role` y `venue_id`; también se pueden leer desde `profiles`.

### Roles del sistema
| Rol | Descripción |
|---|---|
| `CLIENT` | Clientes que reservan canchas. Ven/gestionan solo sus propias reservas. |
| `VENUE_ADMIN` | Admin de un complejo. Tiene `venue_id` en su perfil. Ve todo de su sede. |
| `ADMIN` | Admin general de la plataforma. Ve todo sin restricción. |

### JWT claims necesarios
El token JWT debe contener en `app_metadata` (set server-side via Service Role):
- `role`: 'CLIENT' | 'VENUE_ADMIN' | 'ADMIN'
- `venue_id`: uuid | null (solo para VENUE_ADMIN)

Se usan en las políticas de RLS para filtrar sin hacer queries adicionales.

---

## 3. ROW LEVEL SECURITY (RLS) — Reglas de acceso por tabla

### Patrón de scope por rol (aplica a casi todas las tablas)
```sql
-- Función helper para obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'CLIENT');
$$ LANGUAGE sql STABLE;

-- Función helper para obtener el venue_id del usuario
CREATE OR REPLACE FUNCTION auth.user_venue_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'venue_id')::uuid;
$$ LANGUAGE sql STABLE;
```

### RLS por tabla (resumen)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | solo el propio perfil | NO (trigger) | solo el propio | NO |
| `venues` | todos (público) | ADMIN | ADMIN, VENUE_ADMIN (solo su venue) | ADMIN |
| `sports` | todos (público) | ADMIN | ADMIN | ADMIN |
| `venue_sports` | todos | ADMIN | ADMIN | ADMIN |
| `facilities` | todos activos | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) | ADMIN |
| `schedules` | todos | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) |
| `pricing` | todos | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) |
| `blocked_slots` | ADMIN ve todo; VENUE_ADMIN su venue | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN (su venue) | ADMIN, VENUE_ADMIN |
| `bookings` | CLIENT sus reservas; VENUE_ADMIN su venue; ADMIN todo | CLIENT, con validación | CLIENT/ADMIN markAsPaid, cancel | NO |
| `recurring_bookings` | CLIENT las propias; VENUE_ADMIN su venue; ADMIN todo | CLIENT, ADMIN, VENUE_ADMIN | CLIENT/ADMIN | NO |
| `notifications` | VENUE_ADMIN su venue_id; ADMIN todo | Solo Edge Functions (service role) | NO | NO |
| `notification_reads` | solo las propias | propio user | NO | NO |

---

## 4. LÓGICA DE NEGOCIO CRÍTICA (Edge Functions o cliente)

### 4.1 Cálculo de precio de una reserva
Para una cancha y un horario dado:
1. Buscar en `pricing` la tarifa activa que aplique al día de semana y a la hora de inicio.
2. `base_price` = `price_per_hour` (es el precio del TURNO, no multiplicar por duración).
3. `commission_amount` = `base_price * profit_percent / 100`.
4. `total_price` = `base_price + commission_amount`.
5. Si no hay tarifa activa → error 400 "Tarifa obligatoria".

### 4.2 Validaciones al crear una reserva
1. `start_datetime` no puede ser en el pasado.
2. `end_datetime` > `start_datetime`.
3. La cancha debe existir y estar activa.
4. La duración (en minutos) debe estar entre `min_booking_duration` y `max_booking_duration`.
5. El horario debe caer dentro del `schedule` activo de la cancha para ese día de semana (en hora AR).
6. No debe haber conflicto con otra reserva `CONFIRMED` en el mismo horario.
7. No debe haber conflicto con un `blocked_slot`.
8. Debe existir una tarifa activa para el día/hora (requisito 4.1).

### 4.3 Cancelación de reservas
- **CLIENT**: solo puede cancelar con **≥ 24 horas de anticipación** al `start_datetime` (en instante absoluto, no depende de zona horaria).
- **VENUE_ADMIN** y **ADMIN**: sin límite de tiempo.
- No se puede cancelar una reserva `COMPLETED`.
- Al cancelar: `status = 'CANCELLED'`, setear `cancelled_at`, `cancelled_by`, `cancellation_reason`.

### 4.4 Turno fijo (recurring_booking)
- Al crear, se generan las próximas **8 ocurrencias** del día de semana elegido.
- Las horas se interpretan en **hora local de Argentina (UTC-3)**: `startMin + AR_OFFSET_MIN` para convertir a UTC.
- Los turnos fijos arrancan con `payment_status = 'PENDING'` (no se pagan al crear).
- Las fechas que tienen conflicto se **saltan** (se reportan como `skipped`).
- Si todas las fechas fallan → se borra la recurrencia y se devuelve error.
- Cancelar la serie: poner `is_active = false` en `recurring_bookings` y cancelar todas las `bookings` futuras `CONFIRMED` de la serie.

### 4.5 Cron jobs (reemplazar con `pg_cron` en Supabase o Edge Functions con schedule)

#### Cron 1: Cancelar turno fijo impago (cada hora)
```sql
-- Cancelar reservas de turno fijo CONFIRMED+PENDING cuyo inicio < now() + 24h
UPDATE bookings
SET status = 'CANCELLED',
    cancelled_at = now(),
    cancellation_reason = 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)'
WHERE recurring_booking_id IS NOT NULL
  AND status = 'CONFIRMED'
  AND payment_status = 'PENDING'
  AND start_datetime > now()
  AND start_datetime <= now() + INTERVAL '24 hours';
-- Luego: enviar email + notificación in-app a los admins afectados.
```

#### Cron 2: Recordatorio de turno próximo (cada 10 minutos)
```sql
-- Turnos CONFIRMED+PAID cuyo inicio < now() + 2h y reminder_sent_at IS NULL
SELECT * FROM bookings
WHERE status = 'CONFIRMED'
  AND payment_status = 'PAID'
  AND reminder_sent_at IS NULL
  AND start_datetime > now()
  AND start_datetime <= now() + INTERVAL '2 hours';
-- Luego: enviar email de recordatorio, setear reminder_sent_at = now()
```

#### Cron 3: Completar turnos pagados y ya pasados (cada hora)
```sql
UPDATE bookings
SET status = 'COMPLETED'
WHERE status = 'CONFIRMED'
  AND payment_status = 'PAID'
  AND end_datetime < now();
-- Luego: emitir notificación de comisión ganada al admin general (agrupado por sede).
```

### 4.6 Disponibilidad de canchas
Dado una `facility_id` y una `date` (YYYY-MM-DD en hora AR):
1. Calcular la ventana del día en UTC: `day_start = date 00:00 AR`, `day_end = date 00:00 AR + 48h`.
2. Buscar el `schedule` activo para el día de semana.
3. Buscar `bookings` CONFIRMED con conflicto en la ventana.
4. Buscar `blocked_slots` con conflicto en la ventana.
5. Iterar slots de `open_time` a `close_time` cada `min_booking_duration` min.
6. Cada slot es: `available / booked / blocked / past`.
7. Solo incluir slots con tarifa activa.
8. Si no hay `schedule` activo → `{ available: false }`.

**Versión batch** (para muchas canchas de una sede): misma lógica pero con 3 queries totales independientemente de la cantidad de canchas (no N+1).

### 4.7 Estadísticas (`getStats`)
Filtros: `range` (today|yesterday|week|month|custom|all), `sportId`, `venueId`, `status`.

**Reglas de zona horaria Argentina:**
- Rangos relativos (hoy, ayer, semana, mes) se cortan a medianoche hora Argentina (UTC-3).
  Ej: medianoche AR del día D = `Date.UTC(y, m, d, 0, 0, 0) + 3h` en UTC.
- Rangos personalizados (`from`/`to` en YYYY-MM-DD) también se interpretan como medianoche AR.

**Regla de reconocimiento de ingresos:**
- **Actividad** (conteos: reservas, completadas, canceladas, por deporte, clientes) → se agrupa por **día de INICIO** del turno.
- **Dinero** (ingresos, comisión, base) → se reconoce por el **día de FIN** del turno, y solo si `payment_status = 'PAID'` y `end_datetime <= now()`.
- Un turno que empieza el 26 a las 23:00 y termina el 27 a las 00:30 cuenta su ingreso el día 27.

**Métricas devueltas:**
- `total` = reservas activas (no canceladas) que EMPIEZAN en el período.
- `totalAll` = total + canceladas.
- `confirmed`, `completed`, `cancelled`, `pending` (conteos).
- `totalBase` = suma de `base_price` de los turnos EARNED (solo admin sede ve esto como "Ingresos").
- `totalCommission` = suma de `commission_amount` de los EARNED (solo admin general).
- `totalRevenue` = suma de `total_price` de los EARNED.
- `occupancyRate` = activas / totalAll (% de no cancelados).
- `avgPrice` = totalBase / activas.
- `uniqueClients` = count(distinct user_id) de las activas.
- `byStatus`, `byWeekday`, `byDay` (ingresos por día de FIN en AR), `bySport`, `byVenue`, `recentClients`.

---

## 5. EMAILS TRANSACCIONALES (Resend)

Se envían desde Edge Functions (best-effort, nunca bloquean la operación).

| Evento | Template | Destinatario |
|---|---|---|
| Reserva creada/pagada | `sendBookingConfirmation` | Cliente |
| Turno fijo creado | `sendBookingConfirmation` (con `paymentPending: true`) | Cliente |
| Reserva cancelada (manual o automática) | `sendBookingCancellation` | Cliente |
| Recordatorio ~2h antes | `sendBookingReminder` | Cliente |
| Reset de contraseña | Email nativo de Supabase Auth | Cliente |

Todos los labels de fecha/hora en los emails van en **hora de Argentina (UTC-3)**.

---

## 6. NOTIFICACIONES IN-APP

Sistema de notificaciones para admins (ADMIN y VENUE_ADMIN). El frontend usa polling (cada 30s) para el contador de no leídas.

### Scope por rol
- `VENUE_ADMIN`: ve solo notificaciones con `venue_id = su venue_id`.
- `ADMIN`: ve todo (sin filtro de scope).

### Tipos y cuándo se emiten
| Tipo | Evento disparador | Scope |
|---|---|---|
| `BOOKING_CREATED` | Reserva creada (cliente o manual) | venue_id de la cancha |
| `BOOKING_PAID` | `payment_status = PAID` | venue_id |
| `BOOKING_CANCELLED` | Cancelación manual | venue_id |
| `BOOKING_AUTO_CANCELLED` | Cron cancelación por impago | venue_id |
| `RECURRING_CREATED` | Turno fijo creado | venue_id |
| `NEW_CLIENT` | Primera reserva de un cliente en esa sede | venue_id |
| `COMMISSION_EARNED` | Cron completar turnos | `admin_only = true` |
| `VENUE_OR_FACILITY_CREATED` | Alta de complejo o cancha | `admin_only = true` |
| `USER_REGISTERED` | Registro de nuevo usuario | `admin_only = true` |

### Lecturas por usuario
La tabla `notification_reads` registra qué usuario leyó qué notificación. Una notificación puede ser vista por el venue admin y el admin general con estados de lectura independientes.

---

## 7. STORAGE (Supabase Storage reemplaza Cloudinary)

### Buckets necesarios
| Bucket | Contenido | Acceso |
|---|---|---|
| `venues` | Fotos de complejos | Público (URLs públicas) |
| `facilities` | Fotos de canchas | Público |
| `avatars` | Fotos de perfil de usuario | Público |

### Campos que guardan URLs de imagen
- `venues.image_url`
- `facilities.image_url`
- `profiles.avatar_url`

---

## 8. ARQUITECTURA NUEVA (sin NestJS)

```
Frontend Next.js (Vercel)
    │
    ├── @supabase/supabase-js
    │     ├── supabase.auth.*          → login, register, logout, getUser
    │     ├── supabase.from(tabla).*   → queries con RLS automático
    │     ├── supabase.storage.*       → subir/leer imágenes
    │     └── supabase.channel(*).*    → realtime (notificaciones, disponibilidad)
    │
    └── Supabase Edge Functions (Deno/TypeScript)
          ├── /calculate-price         → lógica de precio (compleja, no va en cliente)
          ├── /create-booking          → validar + calcular + insertar + email + notif
          ├── /create-recurring        → generar 8 ocurrencias + validar cada una
          ├── /cancel-booking          → validar 24h + cancelar + email + notif
          ├── /cancel-recurring        → cancelar serie + future bookings
          ├── /mark-paid               → marcar pagada + notif
          ├── /get-availability        → calcular slots disponibles
          ├── /get-availability-summary → batch para muchas canchas
          ├── /get-stats               → estadísticas con lógica AR compleja
          ├── /send-email              → wrapper Resend (llamado desde otras funciones)
          └── Scheduled Functions (pg_cron o Supabase cron):
                ├── cancel-unpaid-recurring  → cada hora
                ├── send-reminders           → cada 10 minutos
                └── complete-past-bookings   → cada hora
```

---

## 9. PRINCIPIOS SUPABASE-FIRST (guía de implementación)

### Qué va dónde

| Lógica | Dónde implementar | Por qué |
|---|---|---|
| Queries de lectura con filtros | `supabase.from().select()` (cliente) con RLS | RLS garantiza el scope automáticamente |
| Validaciones + escrituras + emails | **Edge Function** | Necesita `service_role` y llamadas externas (Resend) |
| Cálculos complejos de solo datos (stats, disponibilidad, precio) | **Postgres RPC** (`CREATE FUNCTION ... LANGUAGE plpgsql`) | Más eficiente: corre en la DB, una sola llamada |
| Cron jobs | **`pg_cron`** (Postgres nativo en Supabase) | No requiere servidor extra, es nativo |
| Realtime | `supabase.channel().on('postgres_changes')` | Nativo, sin polling |

### Regla de decisión
- ¿La operación necesita llamar a un servicio externo (Resend, Cloudinary)? → **Edge Function**
- ¿La operación necesita saltarse el RLS (escribir notificaciones, ejecutar crons)? → **Edge Function** con `service_role`
- ¿La operación es solo lógica de datos / SQL complejo? → **Postgres RPC** (`supabase.rpc('nombre_funcion')`)
- ¿La operación es una lectura simple con filtros? → **Query directa** con `supabase.from()`

### RLS helpers: preferir `profiles` sobre JWT parsing
```sql
-- NO: parsear el JWT (frágil ante cambios de Supabase)
-- EVITAR: auth.jwt() -> 'app_metadata' ->> 'role'

-- SÍ: leer desde profiles (robusto, siempre actualizado)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_venue_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT venue_id FROM public.profiles WHERE id = auth.uid();
$$;
```

### Modularidad en Edge Functions
- Toda la lógica compartida vive en `supabase/functions/_shared/`:
  - `db.ts` → cliente Supabase admin (service role), helpers de query
  - `pricing.ts` → cálculo de precio (base, comisión, total)
  - `ar-time.ts` → helpers de zona horaria Argentina (UTC-3)
  - `email.ts` → wrapper Resend (best-effort, nunca lanza)
  - `notifications.ts` → emisores de notificaciones in-app
  - `availability.ts` → lógica de slots (reutilizada en RPC y Edge Functions)
- Cada Edge Function importa lo que necesita de `_shared/`, no duplica código.
- Cada Edge Function maneja sus propios errores y retorna `{ data, error }` consistente.

### Estructura de carpetas del proyecto
```
supabase/
├── migrations/
│   ├── 001_schema.sql      → enums + tablas + índices + FKs
│   ├── 002_triggers.sql    → on_auth_user_created, updated_at, set_user_role
│   ├── 003_rls.sql         → RLS policies + helper functions
│   ├── 004_rpc.sql         → Postgres RPC functions (stats, availability, price)
│   └── 005_crons.sql       → pg_cron jobs
└── functions/
    ├── _shared/            → módulos compartidos (no son Edge Functions)
    │   ├── db.ts
    │   ├── pricing.ts
    │   ├── ar-time.ts
    │   ├── email.ts
    │   ├── notifications.ts
    │   └── availability.ts
    ├── create-booking/     → Edge Function
    ├── create-recurring/
    ├── cancel-booking/
    ├── cancel-recurring/
    ├── mark-paid/
    ├── cron-cancel-unpaid/
    ├── cron-send-reminders/
    └── cron-complete-bookings/
```

### Edge cases críticos a cubrir siempre
1. **Usuario sin perfil**: si `profiles` no existe aún (trigger tardío), los helpers de rol devuelven `CLIENT` por defecto.
2. **venue_id null en VENUE_ADMIN**: si un VENUE_ADMIN no tiene `venue_id`, las políticas RLS deben denegarle acceso en vez de mostrar todo.
3. **Turno que cruza medianoche**: `end_time` puede ser menor que `start_time` (ej. 23:00 → 01:00). La ventana del día debe ser de 48h.
4. **Concurrencia en reservas**: dos usuarios reservando el mismo slot al mismo tiempo. Usar `INSERT ... WHERE NOT EXISTS` en una Postgres function para garantizar atomicidad.
5. **Crons idempotentes**: si un cron corre dos veces seguidas (falla de red, reintento), no debe duplicar emails ni notificaciones. `reminder_sent_at` previene esto.
6. **Best-effort en emails/notificaciones**: nunca hacer `await` de emails dentro de una transacción. Disparar y olvidar (`fire and forget`) con manejo de error silencioso.
7. **RLS en tablas sin `venue_id` directo**: para `schedules`, `pricing`, `blocked_slots`, el scope de sede se obtiene haciendo JOIN a `facilities` → `venues`.

---

## TAREAS PENDIENTES ANTES DE LANZAR AL PÚBLICO

- [ ] **Verificar dominio en Resend** para poder enviar emails a cualquier destinatario.
  - Hoy se usa `onboarding@resend.dev` (solo llega al email registrado en Resend, sirve para testing).
  - Para producción: ir a **https://resend.com/domains**, agregar tu dominio, configurar los registros DNS que Resend indique, y luego actualizar el secret `RESEND_FROM_EMAIL` en Supabase Edge Functions con `SportBooking <notificaciones@tudominio.com>`.
