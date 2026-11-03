# Plan de tareas — Migración a Supabase

## Fase 1 — Fundación (schema + auth + RLS)

- [ ] 1. Crear el schema SQL completo
  - Crear `supabase/migrations/001_schema.sql` con enums, tablas, índices y FKs.
  - Aplicar en el proyecto Supabase (`https://olrmhtimfndshayvuowc.supabase.co`).
  - _REQ-1_

- [ ] 2. Triggers de base de datos
  - Trigger `on_auth_user_created` → crea fila en `profiles` automáticamente.
  - Trigger `updated_at` → actualiza el campo en cada UPDATE.
  - Función SQL `set_user_role(user_id, role, venue_id)` para asignar roles en `app_metadata`.
  - _REQ-1, REQ-2_

- [ ] 3. Row Level Security
  - Habilitar RLS en las 12 tablas.
  - Crear funciones helper `auth.user_role()` y `auth.user_venue_id()`.
  - Crear políticas SELECT/INSERT/UPDATE/DELETE según la tabla del steering (sección 3).
  - Crear `supabase/migrations/002_rls.sql`.
  - _REQ-3_

- [ ] 4. Cliente Supabase en el frontend
  - Instalar `@supabase/supabase-js` en el frontend.
  - Crear `frontend/src/lib/supabase.ts` con el cliente.
  - Agregar variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - _REQ-10_

- [ ] 5. Reescribir `useAuthStore` y el flujo de auth del frontend
  - Reemplazar JWT propio por `supabase.auth.signUp/signInWithPassword/signOut/getUser`.
  - El store escucha `supabase.auth.onAuthStateChange` para mantener la sesión.
  - Extraer `role` y `venue_id` del JWT de Supabase (`app_metadata`).
  - Reescribir las páginas de login y registro para usar el SDK.
  - _REQ-2, REQ-10_

---

## Fase 2 — Edge Functions (lógica de negocio)

- [ ] 6. Setup de Edge Functions
  - Instalar Supabase CLI.
  - Inicializar `supabase/` en el proyecto.
  - Crear helper compartido `supabase/functions/_shared/` con: cliente admin (service role), helper de precio, helper de zona AR, helper de emails (Resend), helper de notificaciones.
  - _REQ-4, REQ-5, REQ-6_

- [ ] 7. Edge Function: `/create-booking`
  - Validar los 8 criterios (no pasado, duración, horario, conflictos, tarifa).
  - Calcular precio (base, comisión, total).
  - Insertar `booking` + `CONFIRMED` + `PAID` + `paid_at`.
  - Emitir notificación `BOOKING_CREATED` + chequeo `NEW_CLIENT`.
  - Enviar email de confirmación (best-effort).
  - _REQ-4_

- [ ] 8. Edge Function: `/create-recurring`
  - Generar 8 ocurrencias en hora AR.
  - Validar cada fecha (saltar conflictos).
  - Crear `recurring_booking` + N `bookings` con `PENDING`.
  - Emitir notificación `RECURRING_CREATED`.
  - Enviar email resumen (best-effort).
  - _REQ-4_

- [ ] 9. Edge Functions: `/cancel-booking` y `/cancel-recurring`
  - `/cancel-booking`: validar 24h para CLIENT, cancelar, email + notif `BOOKING_CANCELLED`.
  - `/cancel-recurring`: cancelar futuras, `is_active = false`, retornar count.
  - _REQ-4_

- [ ] 10. Edge Function: `/mark-paid`
  - Validar scope (CLIENT solo las suyas, VENUE_ADMIN solo su sede).
  - Actualizar `payment_status = PAID` + `paid_at`.
  - Emitir notificación `BOOKING_PAID`.
  - _REQ-4_

- [ ] 11. Edge Functions: `/get-availability` y `/get-availability-summary`
  - Lógica de slots disponibles/ocupados/bloqueados/pasados con ventana UTC+AR.
  - Versión batch para muchas canchas (3 queries totales).
  - _REQ-5_

- [ ] 12. Edge Function: `/get-stats`
  - Rangos de fecha en medianoche hora AR.
  - Métricas completas: total, totalAll, confirmed, completed, cancelled, totalBase, totalCommission, occupancyRate, byStatus, byWeekday, byDay, bySport, byVenue, recentClients.
  - Scope por rol (VENUE_ADMIN solo su sede).
  - _REQ-6_

---

## Fase 3 — Crons, Realtime y Storage

- [ ] 13. Cron jobs
  - Implementar los 3 crons (cancelación impago, recordatorios, completar turnos).
  - Usar `pg_cron` de Supabase o Edge Functions programadas.
  - Cada cron llama a helpers de email y notificaciones (best-effort).
  - _REQ-7_

- [ ] 14. Realtime para notificaciones
  - Suscribir al canal de `notifications` con filtro por `venue_id` o `admin_only`.
  - Reemplazar el polling de 30s por Supabase Realtime.
  - Actualizar `NotificationBell` para usar Realtime.
  - _REQ-8_

- [ ] 15. Storage para imágenes
  - Crear los 3 buckets (`venues`, `facilities`, `avatars`) en Supabase Storage.
  - Configurar políticas de acceso público para lectura.
  - Reescribir el componente `ImageUpload` para usar `supabase.storage`.
  - _REQ-9_

---

## Fase 4 — Reescritura de hooks y páginas del frontend

- [ ] 16. Hooks de datos directos (sin Edge Functions)
  - Reescribir hooks que hacen queries simples: `useVenues`, `useFacilities`, `useSports`, `useSchedules`, `usePricing`, `useBlockedSlots`, `useUsers`.
  - Usar `supabase.from(tabla).select()` con joins y filtros.
  - Reemplazar `react-query` donde aplique o mantenerlo con `queryFn` que llame al SDK.
  - _REQ-10_

- [ ] 17. Hooks de reservas
  - `useBookings` → `supabase.from('bookings').select()` con joins a `facilities`, `venues`, `profiles`.
  - `useCreateBooking` → `supabase.functions.invoke('create-booking')`.
  - `useCancelBooking` → `supabase.functions.invoke('cancel-booking')`.
  - `useMarkBookingPaid` → `supabase.functions.invoke('mark-paid')`.
  - `useRecurringBookings`, `useCreateRecurringBooking`, `useCancelRecurringBooking`.
  - _REQ-10_

- [ ] 18. Hooks de disponibilidad y estadísticas
  - `useFacilityAvailability` → `supabase.functions.invoke('get-availability')`.
  - `useAvailabilitySummary` → `supabase.functions.invoke('get-availability-summary')`.
  - Hook de stats → `supabase.functions.invoke('get-stats')`.
  - _REQ-10_

- [ ] 19. Hooks de notificaciones (Realtime)
  - `useUnreadCount` → suscripción Realtime en vez de polling.
  - `useNotifications` → `supabase.from('notifications').select()`.
  - `useMarkNotificationRead` / `useMarkAllNotificationsRead`.
  - _REQ-8, REQ-10_

---

## Fase 5 — Cierre

- [ ] 20. Variables de entorno y verificación end-to-end
  - Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel.
  - Configurar `SUPABASE_SERVICE_ROLE_KEY` y `RESEND_API_KEY` en Edge Functions.
  - Verificar el flujo completo: registro → login → buscar cancha → reservar → pagar → cancelar → notificaciones → estadísticas → subir foto.
  - _REQ-1 al REQ-10_

- [ ] 21. Eliminar el backend NestJS
  - Verificar que todo funciona con Supabase.
  - Eliminar `backend/` del repositorio.
  - Dar de baja el servicio en Railway.
  - Actualizar `README.md`.
  - _REQ-11_
