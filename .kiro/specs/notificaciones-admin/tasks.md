# Plan de implementación — Notificaciones in-app

- [x] 1. Modelo de datos y migración
  - Agregar enum `NotificationType` y modelos `Notification` y `NotificationRead` al `schema.prisma`.
  - Agregar relaciones inversas: `Venue.notifications`, `User.notificationReads`.
  - Crear la migración y aplicarla a la base (dev y Railway de forma no destructiva). Regenerar Prisma Client.
  - _Requisitos: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Módulo backend `notifications` (repository + service de consulta)
  - [x] 2.1 Crear `notifications.repository.ts` con: `create`, `listForUser(scopeWhere, page, limit)` (incluye flag `read` por usuario), `countUnread(scopeWhere, userId)`, `markRead(notificationId, userId)` (upsert), `markAllRead(scopeWhere, userId)`.
    - _Requisitos: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4_
  - [x] 2.2 Crear `notifications.service.ts` con el scope por rol (`VENUE_ADMIN` → `{ venueId }`, `ADMIN` → `{}`) y los métodos `list`, `unreadCount`, `markRead`, `markAllRead`.
    - _Requisitos: 3.1, 3.2, 3.3_
  - [x] 2.3 Crear `notifications.controller.ts` con `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, todos con `JwtAuthGuard` + `RolesGuard` + `@Roles(ADMIN, VENUE_ADMIN)`.
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 3.3_
  - [x] 2.4 Crear `notifications.module.ts` (exporta `NotificationsService`) y registrarlo en `app.module.ts`.

- [x] 3. Emisión de notificaciones (`NotificationsService.emit` + helpers)
  - [x] 3.1 Implementar `emit(input)` best-effort (try/catch interno, nunca lanza).
    - _Requisitos: 2.6_
  - [x] 3.2 Implementar helpers que arman título/cuerpo/`data` en hora AR y montos según reglas: `notifyBookingCreated`, `notifyBookingPaid`, `notifyBookingCancelled(auto)`, `notifyRecurringCreated`, `notifyNewClient`, `notifyCommissionEarned`, `notifyVenueOrFacilityCreated`, `notifyUserRegistered`. Reusar el armado de labels de `toEmailData`.
    - _Requisitos: 7.1, 7.2, 7.3_
  - [x] 3.3 Implementar la detección de "nuevo cliente" (N6): contar bookings previos del cliente en la sede.
    - _Requisitos: (N6)_

- [x] 4. Integrar la emisión en los eventos existentes
  - [x] 4.1 Inyectar `NotificationsService` en `BookingsService`. Emitir en `create`, `createManual` (N1/N7 + chequeo N6), `markAsPaid` (N2), `cancel` (N3), `createRecurring` (N4). Sin bloquear la operación.
    - _Requisitos: 2.1, 2.2, 2.3, 2.5, 2.6_
  - [x] 4.2 Inyectar `NotificationsService` en `BookingsCronService`. Emitir en `cancelUnpaidRecurringBookings` (N5) y `completePastPaidBookings` (N8, agrupado por sede), de forma idempotente (sobre las reservas que recién cambian de estado).
    - _Requisitos: 2.4_
  - [x] 4.3 Emitir N9 (alta de complejo/cancha) y N10 (registro de usuario) en los módulos correspondientes (venues/facilities y auth), best-effort.
    - _Requisitos: (N9, N10)_
  - [x] 4.4 Verificar build backend (`npx nest build`).

- [x] 5. Frontend — hooks y api
  - [x] 5.1 Crear `frontend/src/hooks/use-notifications.ts`: `useNotifications()` (lista paginada), `useUnreadCount()` (con `refetchInterval: 30000` y `refetchOnWindowFocus`), `useMarkRead()` y `useMarkAllRead()` (invalidan `["notifications"]` y `["notifications","unread"]`).
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 6.2_
  - [x] 5.2 Tipos `Notification` en `frontend/src/types`.

- [x] 6. Frontend — badge de campana en el navbar del panel
  - [x] 6.1 Crear componente `NotificationBell` (ícono `Bell` + badge con `unreadCount`), que al hacer clic navega a `/dashboard/notifications`.
  - [x] 6.2 Ubicarlo en el navbar del panel admin (`dashboard/layout.tsx`), visible para ADMIN y VENUE_ADMIN.
    - _Requisitos: 6.1, 6.2, 6.3_

- [x] 7. Frontend — centro de notificaciones (reemplazar placeholder)
  - [x] 7.1 Reemplazar `/dashboard/notifications/page.tsx`: listar notificaciones (más recientes primero), ícono por `type`, título, cuerpo, tiempo relativo en hora AR, destacado si no leída.
    - _Requisitos: 5.1, 5.2, 5.5_
  - [x] 7.2 Clic en una no leída → `markRead`; si tiene `bookingId` → navegar al detalle. Botón "Marcar todas como leídas". Paginación / "ver más".
    - _Requisitos: 5.3, 5.4, 5.6_
  - [x] 7.3 Verificar build frontend (`npx next build`).

- [ ] 8. Verificación end-to-end y cierre
  - Prueba manual: como cliente crear/pagar/cancelar una reserva; confirmar que la notificación aparece en el panel del admin de la sede y del admin general con el scope correcto (otra sede NO la ve) y montos correctos (venue admin base, admin general comisión/total).
  - Verificar que el badge se actualiza por polling y que "marcar todas" pone el contador en 0 solo para ese usuario.
  - Commit + push a `main` por cada paso con builds verificados.
  - _Requisitos: 3.1, 3.2, 6.2, 7.1, 7.2, 7.3_
