# Plan de tareas — Migración a Supabase

## Fase 1 — Fundación de base de datos

- [ ] 1. Schema SQL: enums, tablas, índices
  - Crear `supabase/migrations/001_schema.sql`.
  - Enums primero: `role`, `booking_status`, `payment_status`, `billing_type`, `notification_type`.
  - 12 tablas en orden de dependencia (sin FKs circulares).
  - Índices de `notifications` y `notification_reads`.
  - Usar `CREATE TYPE IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS` para idempotencia.
  - Aplicar en Supabase.
  - _REQ-1_

- [ ] 2. Triggers y funciones de DB
  - Crear `supabase/migrations/002_triggers.sql`.
  - Trigger `handle_new_user` → popula `profiles` al registrarse.
  - Trigger `set_updated_at` → actualiza `updated_at` en cada UPDATE.
  - Función `set_user_role(p_user_id, p_role, p_venue_id)` con SECURITY DEFINER.
  - Funciones helper RLS: `get_my_role()` y `get_my_venue_id()` leyendo desde `profiles` (no desde JWT).
  - Edge case: `get_my_role()` devuelve `'CLIENT'` si el perfil no existe aún.
  - Aplicar en Supabase.
  - _REQ-2_

- [ ] 3. Row Level Security (RLS)
  - Crear `supabase/migrations/003_rls.sql`.
  - Habilitar RLS en las 12 tablas.
  - Políticas por tabla según sección 3 del steering.
  - Edge case: VENUE_ADMIN sin venue_id → denegar acceso a datos de sede.
  - Edge case: usuario anónimo → solo lectura en tablas públicas.
  - Aplicar en Supabase.
  - _REQ-4_

- [ ] 4. Postgres RPC: precio, disponibilidad y estadísticas
  - Crear `supabase/migrations/004_rpc.sql`.
  - `calculate_price(p_facility_id, p_start_datetime)` → `{base_price, commission_amount, total_price}`.
  - `get_availability(p_facility_id, p_date)` → slots con `available/booked/blocked/past`.
  - `get_availability_summary(p_venue_id, p_sport_id, p_date)` → batch 3 queries.
  - `get_stats(p_range, p_from, p_to, p_sport_id, p_venue_id, p_status)` → métricas completas con scope por rol automático.
  - Todas manejan el edge case de horario que cruza medianoche (ventana 48h).
  - `get_stats` lee `get_my_venue_id()` internamente para scope VENUE_ADMIN.
  - Aplicar en Supabase.
  - _REQ-5, REQ-6_

- [ ] 5. Cron jobs con pg_cron
  - Crear `supabase/migrations/005_crons.sql`.
  - Cron 1 (cada hora): cancelar turnos fijos impagas < 24h.
  - Cron 2 (cada 10 min): recordatorios < 2h (idempotente por `reminder_sent_at`).
  - Cron 3 (cada hora): completar turnos `PAID` ya pasados.
  - Los crons hacen el cambio de estado en DB y luego llaman a una Edge Function para emails (best-effort).
  - Aplicar en Supabase (requiere extensión `pg_cron` habilitada).
  - _REQ-8_

---

## Fase 2 — Cliente Supabase y Auth en el frontend

- [ ] 6. Setup del cliente Supabase en el frontend
  - Instalar `@supabase/supabase-js` y `@supabase/ssr` en el frontend.
  - Crear `frontend/src/lib/supabase.ts`: cliente browser y helper de server.
  - Agregar `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - _REQ-11_

- [ ] 7. Reescribir `useAuthStore` y páginas de auth
  - Reescribir `useAuthStore` para usar `supabase.auth.onAuthStateChange`.
  - Extraer `role` y `venue_id` del `user.app_metadata` del JWT de Supabase.
  - Fallback: si `app_metadata` está vacío, leer de `profiles` directamente.
  - Reescribir página de login: usar `signInWithPassword`.
  - Reescribir página de registro: usar `signUp` con `data: { first_name, last_name }`.
  - Edge case: token expirado → Supabase refresca automáticamente.
  - Edge case: trigger de profiles fallido → mostrar error de registro gracioso.
  - _REQ-3, REQ-11_

---

## Fase 3 — Módulos compartidos y Edge Functions

- [ ] 8. Módulos compartidos (`_shared/`)
  - Crear `supabase/functions/_shared/db.ts`: cliente Supabase admin (service role), helper para crear el cliente con la request.
  - Crear `supabase/functions/_shared/ar-time.ts`: `arMidnightUtc`, `arDayKey`, `arDateLabel`, `arTime`, `toArDate`.
  - Crear `supabase/functions/_shared/pricing.ts`: wrapper de la RPC `calculate_price`.
  - Crear `supabase/functions/_shared/email.ts`: wrapper Resend best-effort (`sendConfirmation`, `sendCancellation`, `sendReminder`). Nunca lanza.
  - Crear `supabase/functions/_shared/notifications.ts`: `emitNotification(type, title, body, venueId?, adminOnly?)` con service role. Nunca lanza.
  - Cada módulo es independiente y no importa de otros `_shared/` para evitar acoplamiento circular.
  - _REQ-7_

- [ ] 9. Edge Function: `create-booking`
  - Validar autenticación (JWT requerido).
  - Validar los 8 criterios de booking (usar RPC `calculate_price` y query de conflictos).
  - Insertar en `bookings` usando `service_role` para garantizar atomicidad.
  - Emitir `BOOKING_CREATED` + chequeo `NEW_CLIENT`.
  - Email de confirmación best-effort.
  - Responde `{ data: booking, error: null }` o `{ data: null, error: { message, code } }`.
  - Edge case: conflicto de concurrencia → 409.
  - _REQ-7_

- [ ] 10. Edge Function: `create-recurring`
  - Generar 8 ocurrencias en hora AR.
  - Validar y crear cada una en loop (saltar conflictos).
  - Edge case: todas fallan → rollback de `recurring_bookings` + error 400.
  - Emitir `RECURRING_CREATED`, email resumen best-effort.
  - _REQ-7_

- [ ] 11. Edge Functions: `cancel-booking` y `cancel-recurring`
  - `cancel-booking`: validar 24h para CLIENT. Edge cases: ya cancelada, ya completada.
  - `cancel-recurring`: cancelar futuras, `is_active = false`.
  - Notif + email best-effort en ambas.
  - _REQ-7_

- [ ] 12. Edge Function: `mark-paid`
  - Validar scope por rol.
  - Idempotente: si ya es PAID, retornar éxito sin re-procesar.
  - Emitir `BOOKING_PAID`.
  - _REQ-7_

- [ ] 13. Edge Functions de crons (efectos secundarios)
  - `cron-cancel-unpaid`: recibe lista de bookings cancelados → envía emails + notifs.
  - `cron-send-reminders`: recibe lista de bookings → envía recordatorios.
  - `cron-complete-bookings`: recibe bookings completados → emite notifs de comisión por sede.
  - Son llamadas por los crons de `pg_cron`, no expuestas al frontend.
  - _REQ-8_

---

## Fase 4 — Reescritura de hooks del frontend

- [ ] 14. Hooks de datos (queries directas con SDK)
  - `useVenues`: `supabase.from('venues').select()`.
  - `useFacilities`: `supabase.from('facilities').select('*, sport(*), venue(*), schedules(*), pricing(*)')`.
  - `useSports`, `useSchedules`, `usePricing`, `useBlockedSlots`, `useUsers`.
  - Mantener `react-query` como capa de cache; `queryFn` usa el SDK.
  - _REQ-11_

- [ ] 15. Hooks de reservas
  - `useBookings`: `supabase.from('bookings').select('*, facility(*, venue(*)), user:profiles(*)')`.
  - `useCreateBooking` → `supabase.functions.invoke('create-booking')`.
  - `useCancelBooking` → `supabase.functions.invoke('cancel-booking')`.
  - `useMarkBookingPaid` → `supabase.functions.invoke('mark-paid')`.
  - `useRecurringBookings`, `useCreateRecurringBooking`, `useCancelRecurringBooking`.
  - Invalidar queries correctas en `onSuccess` de cada mutación.
  - _REQ-11_

- [ ] 16. Hooks de disponibilidad y estadísticas
  - `useFacilityAvailability` → `supabase.rpc('get_availability', { p_facility_id, p_date })`.
  - `useAvailabilitySummary` → `supabase.rpc('get_availability_summary', { p_venue_id, p_sport_id, p_date })`.
  - `useStats` → `supabase.rpc('get_stats', { p_range, ... })`.
  - _REQ-11_

- [ ] 17. Notificaciones con Realtime
  - `useNotifications` → `supabase.from('notifications').select('*, reads:notification_reads(*)')`.
  - `useUnreadCount` → suscripción Realtime en `notifications` (INSERT) + query inicial.
  - Componente `NotificationBell` reescrito con Realtime (eliminar polling de 30s).
  - Edge case: reconexión automática de Realtime → resincronizar el contador.
  - `useMarkNotificationRead`, `useMarkAllNotificationsRead` → insert en `notification_reads`.
  - _REQ-9, REQ-11_

---

## Fase 5 — Storage

- [ ] 18. Buckets y políticas de Storage
  - Crear buckets `venues`, `facilities`, `avatars` en Supabase Storage (públicos para lectura).
  - Políticas: ADMIN/VENUE_ADMIN pueden subir a `venues` y `facilities`; cada usuario solo a `avatars/{uid}/`.
  - Edge case: validar tipo y tamaño antes de subir (solo imágenes, máx 5MB).
  - _REQ-10_

- [ ] 19. Reescribir componente `ImageUpload`
  - Reemplazar `apiClient.upload()` (Cloudinary) por `supabase.storage.from(bucket).upload(path, file)`.
  - Guardar la URL pública obtenida de `supabase.storage.from(bucket).getPublicUrl(path)`.
  - _REQ-10_

---

## Fase 6 — Cierre

- [ ] 20. Variables de entorno y verificación end-to-end
  - Configurar en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Configurar en Edge Functions: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`.
  - Verificar flujo completo: registro → login → buscar cancha → reservar → pagar → cancelar → notificaciones → estadísticas → subir foto.
  - Verificar scope por rol: CLIENT, VENUE_ADMIN, ADMIN.
  - _REQ-1 al REQ-11_

- [ ] 21. Eliminar backend NestJS
  - Confirmar que todo el flujo funciona en Supabase.
  - Eliminar `backend/` del repositorio.
  - Dar de baja servicio en Railway.
  - Actualizar `README.md` con nueva arquitectura.
  - _REQ-12_
