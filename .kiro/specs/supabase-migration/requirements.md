# Requisitos — Migración a Supabase

## Contexto

Se reemplaza el backend NestJS + Prisma + Railway por Supabase como backend completo.
El frontend Next.js (Vercel) pasa a comunicarse directamente con Supabase.
No se migran datos existentes: se arranca con base nueva.

**Proyecto Supabase**: `https://olrmhtimfndshayvuowc.supabase.co`

### Principio arquitectónico
No replicar un backend tradicional dentro de Supabase. Aprovechar lo nativo:
- **RLS** para control de acceso (no lógica de aplicación).
- **Postgres RPC** para lógica compleja de datos (no llamadas externas).
- **Edge Functions** solo cuando se necesita `service_role`, llamadas externas (Resend), o crons.
- **Realtime** para eventos en vivo (no polling).
- **`pg_cron`** para tareas programadas (no crons de Node.js).

---

## REQ-1 — Schema de base de datos

**Como** plataforma, **quiero** que todas las tablas del sistema existan en Supabase Postgres con sus constraints y relaciones, **para** poder almacenar todos los datos del negocio con integridad referencial.

### Criterios de aceptación
1. Los 5 enums Postgres (`role`, `booking_status`, `payment_status`, `billing_type`, `notification_type`) deben existir antes de las tablas.
2. Las 12 tablas deben crearse con columnas, tipos, constraints (NOT NULL, UNIQUE, DEFAULT) y FKs con cascade según el steering.
3. Los índices de `notifications(venue_id, created_at)` y `(admin_only, created_at)` deben crearse para performance.
4. El índice de `notification_reads(user_id)` y el unique `(notification_id, user_id)` deben existir.
5. Todo el schema vive en `supabase/migrations/001_schema.sql`.
6. Edge case: si se aplica la migración dos veces, no debe fallar (`CREATE IF NOT EXISTS`, `IF NOT EXISTS`).

---

## REQ-2 — Triggers y funciones de base de datos

**Como** plataforma, **quiero** que la base de datos mantenga consistencia automáticamente, **para** no depender de lógica de aplicación para operaciones rutinarias.

### Criterios de aceptación
1. Trigger `handle_new_user`: al insertar en `auth.users`, crea automáticamente una fila en `profiles` con `id = auth.users.id` y `role = 'CLIENT'`.
2. Trigger `set_updated_at`: en cada `UPDATE` de tablas con `updated_at`, lo actualiza a `now()`.
3. Función SQL `set_user_role(p_user_id uuid, p_role text, p_venue_id uuid DEFAULT NULL)` que:
   - Actualiza `profiles.role` y `profiles.venue_id`.
   - Actualiza `app_metadata` del usuario en `auth.users` con `role` y `venue_id` (para que el JWT lo lleve).
   - Solo puede ser ejecutada con `service_role` (SECURITY DEFINER).
4. Funciones helper RLS sin JWT parsing:
   - `get_my_role()` → lee `profiles.role` del `auth.uid()` actual.
   - `get_my_venue_id()` → lee `profiles.venue_id` del `auth.uid()` actual.
   - Ambas con `SECURITY DEFINER` y `STABLE`.
   - Edge case: si el perfil no existe aún, devolver `'CLIENT'` / `NULL` en vez de error.
5. Todo en `supabase/migrations/002_triggers.sql`.

---

## REQ-3 — Autenticación con Supabase Auth

**Como** usuario, **quiero** poder registrarme e iniciar sesión, **para** acceder a la plataforma según mi rol.

### Criterios de aceptación
1. El registro usa `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name } } })`.
2. El login usa `supabase.auth.signInWithPassword`. Devuelve sesión con JWT.
3. El JWT incluye `app_metadata.role` y `app_metadata.venue_id` (seteados por `set_user_role`).
4. El store `useAuthStore` del frontend escucha `supabase.auth.onAuthStateChange` para sincronizar la sesión.
5. El refresh de sesión lo maneja Supabase automáticamente.
6. Edge case: si el usuario se registra pero el trigger de `profiles` falla, el sistema debe manejar el error graciosamente (no mostrar pantalla rota).
7. Edge case: token expirado → Supabase lo refresca automáticamente; el frontend debe reintentar la operación fallida.

---

## REQ-4 — Row Level Security (RLS)

**Como** plataforma, **quiero** que el acceso a datos esté controlado en la base de datos, **para** garantizar aislamiento entre roles y sedes sin depender de lógica de aplicación.

### Criterios de aceptación
1. RLS habilitado en las 12 tablas. Sin políticas = acceso denegado por defecto.
2. Políticas SELECT/INSERT/UPDATE/DELETE implementadas según la sección 3 del steering.
3. Edge case: `VENUE_ADMIN` sin `venue_id` → las políticas deben denegar acceso a datos de sede (no mostrar todo ni romper).
4. Edge case: usuario anónimo (no autenticado) → solo puede SELECT en tablas públicas (`venues`, `sports`, `facilities` activas, `schedules`, `pricing`).
5. Edge case: `CLIENT` intenta acceder a reserva de otro usuario → 404 o array vacío, nunca datos de otro.
6. Las Edge Functions y crons usan `service_role` para operaciones que necesiten bypass de RLS (insertar notificaciones, completar turnos).
7. Todo en `supabase/migrations/003_rls.sql`.

---

## REQ-5 — Postgres RPC: cálculo de precio y disponibilidad

**Como** frontend, **quiero** obtener precios de slots y disponibilidad de canchas, **para** mostrar opciones al cliente.

> Estas operaciones son pura lógica SQL, no necesitan llamadas externas → van como Postgres RPC.

### Criterios de aceptación
1. **`calculate_price(p_facility_id, p_start_datetime)`** (RPC):
   - Busca tarifa activa para ese día/hora.
   - Retorna `{ base_price, commission_amount, total_price }`.
   - Edge case: sin tarifa activa → error con mensaje "Sin tarifa para este día/hora".
   - Edge case: cancha inactiva → error.
2. **`get_availability(p_facility_id, p_date)`** (RPC):
   - Genera slots según el schedule activo del día (hora AR).
   - Marca cada slot: `available`, `booked`, `blocked`, `past`.
   - Solo slots con tarifa activa.
   - Edge case: sin schedule activo → `{ available: false, slots: [], message: 'Sin horario' }`.
   - Edge case: horario que cruza medianoche (close_time < open_time) → ventana de 48h en UTC.
3. **`get_availability_summary(p_venue_id, p_sport_id, p_date)`** (RPC):
   - Versión batch: 3 queries totales sin importar cantidad de canchas.
   - Retorna array con `{ facility_id, available, has_free_slots, free_count, free_slots[] }`.
4. Todo en `supabase/migrations/004_rpc.sql`.

---

## REQ-6 — Postgres RPC: estadísticas

**Como** administrador, **quiero** métricas de rendimiento del negocio, **para** tomar decisiones.

> Lógica compleja de SQL, sin llamadas externas → Postgres RPC.

### Criterios de aceptación
1. **`get_stats(p_range, p_from, p_to, p_sport_id, p_venue_id, p_status)`** (RPC):
   - Scope por rol: lee `get_my_venue_id()` internamente; si es VENUE_ADMIN, filtra automáticamente.
   - Rangos relativos cortados a medianoche hora Argentina (UTC-3).
   - Ingresos reconocidos por día de FIN del turno, solo turnos `PAID` y ya finalizados.
   - Devuelve: `total`, `totalAll`, `confirmed`, `completed`, `cancelled`, `totalBase`, `totalCommission`, `totalRevenue`, `occupancyRate`, `avgPrice`, `uniqueClients`, `byStatus`, `byWeekday`, `byDay`, `bySport`, `byVenue`, `recentClients`.
   - Edge case: rango `custom` sin `from`/`to` → error descriptivo.
   - Edge case: período sin reservas → devolver zeros, no error.
2. Todo en `supabase/migrations/004_rpc.sql`.

---

## REQ-7 — Edge Functions: operaciones de escritura con efectos secundarios

**Como** usuario, **quiero** crear, pagar y cancelar reservas, **para** gestionar mis turnos.

> Van como Edge Functions porque necesitan `service_role` (escribir notificaciones) y llamadas externas (Resend).

### Criterios de aceptación
1. **`create-booking`**:
   - Valida los 8 criterios (pasado, duración, horario, conflicto con booking, conflicto con blocked_slot, tarifa, cancha activa, cancha existe).
   - Usa `calculate_price` RPC internamente.
   - Atomicidad: INSERT en una Postgres function para evitar race conditions en disponibilidad.
   - Retorna la reserva completa con joins a facility, venue, profile.
   - Best-effort: email + notificación después del INSERT (no dentro de la transacción).
   - Edge case: conflicto de concurrencia → error 409 "Horario ya reservado".
   - Edge case: sin tarifa → error 400 "Sin tarifa para este horario".
2. **`create-recurring`**:
   - Genera 8 ocurrencias en hora AR.
   - Valida cada fecha individualmente (salta las que tienen conflicto).
   - Edge case: todas las fechas fallan → rollback del `recurring_bookings` y error 400.
   - Edge case: 0 < createdCount < 8 → éxito parcial, reportar `skipped`.
3. **`cancel-booking`**:
   - Valida regla de 24h para CLIENT (instante absoluto, no depende de zona).
   - Edge case: reserva ya CANCELLED → error 400.
   - Edge case: reserva COMPLETED → error 400.
4. **`cancel-recurring`**: cancela futuras + pone `is_active = false`. Retorna `cancelledCount`.
5. **`mark-paid`**: valida scope (CLIENT solo las suyas, VENUE_ADMIN solo su sede). Edge case: ya PAID → idempotente (no error).
6. Todas retornan `{ data, error }` consistente. Error con `status` HTTP apropiado (400, 403, 404, 409).

---

## REQ-8 — Cron jobs con pg_cron

**Como** plataforma, **quiero** tareas automáticas de mantenimiento, **para** mantener el estado consistente.

### Criterios de aceptación
1. **Cron 1** (cada hora): cancela turnos fijos `CONFIRMED+PENDING` con inicio dentro de las próximas 24h.
   - Usa `pg_cron` + una Postgres function que hace el UPDATE y llama a una Edge Function para emails/notifs.
   - Idempotente: solo procesa los que aún son `CONFIRMED` (no re-cancela ya cancelados).
2. **Cron 2** (cada 10 min): recordatorio a turnos `CONFIRMED+PAID` con inicio < now + 2h y `reminder_sent_at IS NULL`.
   - Setea `reminder_sent_at` en el mismo batch antes de enviar (para que el siguiente cron no reenvíe).
3. **Cron 3** (cada hora): pasa a `COMPLETED` las reservas `CONFIRMED+PAID` con `end_datetime < now()`. Agrupa comisiones por sede para la notificación.
4. Todos los crons usan `pg_cron` en `005_crons.sql`. Llaman a Edge Functions para efectos secundarios externos (emails).
5. Edge case: si la Edge Function de email falla, el cambio de estado en la DB ya se aplicó y no se deshace (best-effort).

---

## REQ-9 — Notificaciones in-app con Realtime

**Como** administrador, **quiero** recibir notificaciones en tiempo real, **para** estar al tanto sin recargar la página.

### Criterios de aceptación
1. El frontend suscribe a `supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, callback)`.
2. VENUE_ADMIN filtra por `venue_id = su_venue_id` en el filtro del canal.
3. Al llegar un INSERT en `notifications`, el badge de la campana se actualiza sin polling.
4. `notification_reads`: lecturas por usuario, insert idempotente con `ON CONFLICT DO NOTHING`.
5. Reemplaza completamente el polling de 30s.
6. Edge case: si la suscripción Realtime se cae (reconecta automáticamente), el badge debe resincronizarse al reconectar.

---

## REQ-10 — Storage con Supabase Storage

**Como** administrador, **quiero** subir fotos de complejos, canchas y perfil, **para** mostrar las instalaciones a los clientes.

### Criterios de aceptación
1. Tres buckets: `venues` (público), `facilities` (público), `avatars` (público).
2. Políticas de Storage: ADMIN y VENUE_ADMIN pueden subir a `venues` y `facilities`; cada usuario puede subir solo a `avatars/{su_user_id}/`.
3. El componente `ImageUpload` usa `supabase.storage.from(bucket).upload()` y guarda la URL pública.
4. Edge case: archivo demasiado grande → error descriptivo al usuario.
5. Edge case: tipo de archivo no permitido → validar antes de subir (solo imágenes: jpg, png, webp).
6. Las URLs se guardan en `venues.image_url`, `facilities.image_url`, `profiles.avatar_url`.

---

## REQ-11 — Reescritura del frontend

**Como** frontend, **quiero** reemplazar el `api-client` de NestJS por el SDK de Supabase, **para** comunicarme directamente con el backend.

### Criterios de aceptación
1. `frontend/src/lib/supabase.ts`: cliente Supabase con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. `useAuthStore` reescrito con `onAuthStateChange`. Extrae `role` y `venue_id` del perfil/session.
3. Queries simples (venues, facilities, sports, schedules, pricing, bookings list) → `supabase.from()` directo.
4. Operaciones con efectos secundarios (crear/cancelar reserva, pagar) → `supabase.functions.invoke()`.
5. Lógica de solo datos (stats, disponibilidad, precio) → `supabase.rpc()`.
6. Notificaciones → `supabase.channel()` Realtime.
7. El `api-client.ts` actual se elimina o se reemplaza por un wrapper del SDK.
8. `react-query` se mantiene como capa de cache; los `queryFn` usan el SDK en vez de `apiClient`.
9. El frontend NUNCA tiene la `service_role` key.
10. Edge case: error de red → `react-query` reintenta automáticamente.
11. Edge case: usuario no autenticado intenta operación protegida → redirigir a login.

---

## REQ-12 — Eliminar backend NestJS

**Como** proyecto, **quiero** eliminar la carpeta `backend/` una vez que Supabase esté funcional, **para** simplificar el repositorio.

### Criterios de aceptación
1. Verificar que el flujo completo funcione: registro → login → buscar → reservar → pagar → cancelar → stats → subir foto.
2. Eliminar `backend/` del repo.
3. Dar de baja el servicio en Railway.
4. Actualizar `README.md` con la nueva arquitectura.
5. Mantener el directorio `supabase/` como el nuevo "backend".
