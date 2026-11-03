# Requisitos — Migración a Supabase

## Contexto

Se reemplaza el backend NestJS + Prisma + Railway por Supabase como backend completo.
El frontend Next.js (Vercel) pasa a comunicarse directamente con Supabase.
No se migrán datos existentes: se arranca con base nueva.

**Proyecto Supabase**: `https://olrmhtimfndshayvuowc.supabase.co`

---

## REQ-1 — Schema de base de datos

**Como** plataforma, **quiero** que todas las tablas del sistema existan en Supabase Postgres, **para** poder almacenar y consultar todos los datos del negocio.

### Criterios de aceptación
1. Las 12 tablas del steering deben crearse con sus columnas, tipos, constraints y relaciones FK exactas.
2. Los 5 enums Postgres deben existir antes de las tablas.
3. Los índices de `notifications` deben crearse para performance de consultas de admin.
4. La tabla `profiles` debe tener un trigger `on_auth_user_created` que la popule automáticamente al registrarse un usuario en Supabase Auth.
5. El campo `updated_at` debe actualizarse automáticamente vía trigger en cada tabla que lo tenga.
6. Todo el schema vive en un archivo SQL versionado en `supabase/migrations/`.

---

## REQ-2 — Autenticación con Supabase Auth

**Como** usuario, **quiero** poder registrarme e iniciar sesión con email y contraseña, **para** acceder a la plataforma según mi rol.

### Criterios de aceptación
1. El registro crea un usuario en `auth.users` y su perfil en `profiles` automáticamente (trigger).
2. El login devuelve un JWT de Supabase con `app_metadata` que incluye `role` y `venue_id`.
3. Los roles (`CLIENT`, `VENUE_ADMIN`, `ADMIN`) se almacenan en `app_metadata` del usuario (no en `user_metadata`) para que estén disponibles en las políticas RLS.
4. El frontend usa `supabase.auth.signUp`, `signInWithPassword`, `signOut` y `getUser`.
5. El store `useAuthStore` del frontend se reescribe para usar la sesión de Supabase en vez del JWT propio.
6. El refresh de sesión lo maneja Supabase automáticamente (no hace falta `refreshToken` manual).
7. Debe existir una función SQL para asignar/cambiar el rol de un usuario (usada por admin para crear VENUE_ADMIN).

---

## REQ-3 — Row Level Security (RLS)

**Como** plataforma, **quiero** que las políticas de acceso a datos se apliquen en la base de datos, **para** garantizar que cada usuario solo vea y modifique lo que le corresponde sin depender de lógica de aplicación.

### Criterios de aceptación
1. RLS debe estar habilitado en las 12 tablas.
2. Las funciones helper `auth.user_role()` y `auth.user_venue_id()` deben existir para usarlas en las políticas.
3. Políticas implementadas según la tabla del steering (sección 3): SELECT/INSERT/UPDATE/DELETE por rol.
4. Un `CLIENT` nunca puede leer reservas de otro usuario.
5. Un `VENUE_ADMIN` nunca puede leer/escribir datos de otra sede.
6. Las Edge Functions que necesiten saltarse el RLS usan la `service_role` key (nunca expuesta al frontend).

---

## REQ-4 — Edge Functions: operaciones de reservas

**Como** usuario, **quiero** poder crear, pagar y cancelar reservas, **para** gestionar mis turnos deportivos.

### Criterios de aceptación
1. **`/create-booking`**: valida los 8 criterios del steering (4.2), calcula el precio (4.1), inserta en `bookings` con `CONFIRMED` + `PAID`, envía email de confirmación y emite notificación al admin. Retorna la reserva creada.
2. **`/create-recurring`**: genera las 8 ocurrencias, valida cada una, salta las que tienen conflicto, crea `recurring_bookings` + `bookings` con `PENDING`, envía email resumen. Retorna `{ createdCount, skippedCount, skipped }`.
3. **`/cancel-booking`**: valida regla de 24h para CLIENT, cancela la reserva, envía email, emite notificación. Admins sin límite de tiempo.
4. **`/cancel-recurring`**: cancela todas las reservas futuras de la serie, pone `is_active = false`, retorna `cancelledCount`.
5. **`/mark-paid`**: marca `payment_status = PAID`, `paid_at = now()`, emite notificación de pago al admin.
6. Todas las funciones son best-effort para emails y notificaciones (no fallan si el email falla).

---

## REQ-5 — Edge Functions: disponibilidad

**Como** cliente, **quiero** ver qué horarios están disponibles en una cancha para una fecha, **para** elegir cuándo reservar.

### Criterios de aceptación
1. **`/get-availability`**: recibe `facility_id` y `date` (YYYY-MM-DD en hora AR). Devuelve lista de slots con `{ time, available, reason }` según la lógica del steering (4.6).
2. **`/get-availability-summary`**: recibe `venue_id`, `sport_id`, `date`. Devuelve resumen por cancha en 3 queries totales (no N+1). Incluye `freeSlots` para cruzar alternativas.
3. Ambas funciones usan la ventana de día en UTC con offset AR (`day_start = 00:00 AR`, `day_end = 00:00 AR + 48h`).
4. Un slot es `past` si ya pasó la hora actual. `booked` si tiene reserva `CONFIRMED`. `blocked` si tiene `blocked_slot`.
5. Solo se devuelven slots con tarifa activa para ese día.

---

## REQ-6 — Edge Functions: estadísticas

**Como** administrador, **quiero** ver métricas de rendimiento del negocio filtradas por período, sede y deporte, **para** tomar decisiones informadas.

### Criterios de aceptación
1. **`/get-stats`**: recibe `range`, `from`, `to`, `sportId`, `venueId`, `status`. Devuelve todas las métricas del steering (4.7).
2. Los rangos relativos se cortan a medianoche hora Argentina (UTC-3).
3. Los ingresos (`totalBase`, `totalCommission`) se reconocen por día de FIN del turno.
4. El VENUE_ADMIN solo ve stats de su sede (scope por `venue_id`).
5. La tarjeta "Reservas" (`totalAll`) incluye canceladas. La tarjeta "Ingresos" usa `totalBase` (precio base, sin comisión).

---

## REQ-7 — Cron jobs

**Como** plataforma, **quiero** que las tareas automáticas de mantenimiento de reservas se ejecuten periódicamente, **para** mantener el estado del sistema consistente.

### Criterios de aceptación
1. **Cron 1** (cada hora): cancela reservas de turno fijo `CONFIRMED+PENDING` con inicio < now + 24h. Envía email + notificación por cada reserva cancelada.
2. **Cron 2** (cada 10 min): envía recordatorio por email a turnos `CONFIRMED+PAID` con inicio < now + 2h y `reminder_sent_at IS NULL`. Setea `reminder_sent_at = now()` (idempotente).
3. **Cron 3** (cada hora): pasa a `COMPLETED` las reservas `CONFIRMED+PAID` con `end_datetime < now()`. Emite notificación de comisión al admin general agrupada por sede.
4. Los crons se implementan con `pg_cron` de Supabase o con Edge Functions programadas.

---

## REQ-8 — Notificaciones in-app con Realtime

**Como** administrador, **quiero** recibir notificaciones en tiempo real sobre eventos del negocio, **para** estar al tanto sin recargar la página.

### Criterios de aceptación
1. El frontend suscribe a la tabla `notifications` vía Supabase Realtime filtrado por `venue_id` (VENUE_ADMIN) o sin filtro (ADMIN).
2. Al llegar una notificación nueva, el badge de la campana en el navbar se actualiza sin polling.
3. Se mantiene la tabla `notification_reads` con lecturas por usuario.
4. Los 9 tipos de notificación del steering (sección 6) deben emitirse desde las Edge Functions correspondientes.
5. Reemplaza el polling de 30s actual por Realtime nativo.

---

## REQ-9 — Storage con Supabase Storage

**Como** administrador, **quiero** subir fotos de complejos y canchas, **para** que los clientes vean las instalaciones.

### Criterios de aceptación
1. Tres buckets públicos: `venues`, `facilities`, `avatars`.
2. El componente `ImageUpload` del frontend se reescribe para usar `supabase.storage` en vez de Cloudinary.
3. Las URLs públicas de Supabase Storage se guardan en `venues.image_url`, `facilities.image_url`, `profiles.avatar_url`.
4. Solo el usuario autenticado puede subir a su propio bucket de avatars. ADMIN y VENUE_ADMIN pueden subir a `venues` y `facilities`.

---

## REQ-10 — Reescritura del frontend (api-client → Supabase SDK)

**Como** frontend, **quiero** reemplazar todas las llamadas al NestJS por el SDK de Supabase, **para** comunicarme directamente con el backend sin un servidor intermedio.

### Criterios de aceptación
1. Crear `frontend/src/lib/supabase.ts` con el cliente de Supabase usando las credenciales del proyecto.
2. Reescribir `useAuthStore` para usar `supabase.auth`.
3. Reemplazar `api-client.ts` por helpers que usen `supabase.from(tabla)` para queries directas y `supabase.functions.invoke()` para Edge Functions.
4. Todos los hooks de `frontend/src/hooks/` se reescriben para usar el SDK.
5. El frontend nunca tiene la `service_role` key; solo usa la `publishable` key.
6. Las variables de entorno del frontend son: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## REQ-11 — Eliminar el backend NestJS

**Como** proyecto, **quiero** eliminar toda la carpeta `backend/` una vez que Supabase esté funcionando, **para** simplificar el repositorio.

### Criterios de aceptación
1. Verificar que el frontend funcione completamente con Supabase antes de eliminar el backend.
2. Eliminar `backend/` del repositorio.
3. Eliminar el servicio de Railway (Postgres + NestJS).
4. Actualizar el `README.md` con la nueva arquitectura.
