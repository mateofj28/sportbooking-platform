# Diseño — Notificaciones in-app para administradores

## Visión general

Sistema de notificaciones in-app con **polling** desde el frontend. Se agrega un modelo `Notification` en Prisma, un módulo `notifications` en el backend (controller + service + repository), un `NotificationsService` que se inyecta en `BookingsService` y en los crons para **emitir** notificaciones best-effort, y en el frontend: hooks de react-query con polling, un badge de campana en el navbar del panel, y el centro de notificaciones real reemplazando el placeholder.

Principios:
- **Best-effort**: emitir una notificación nunca debe romper la operación de negocio (igual que el `MailService`).
- **Scope por rol reutilizando el patrón existente**: `facility.venueId` para el admin de sede; todas + globales para el admin general.
- **Reglas de negocio**: montos en hora AR; para venue admin, precio base; comisión solo admin general.
- **Idempotencia en crons**: no duplicar notificaciones en corridas sucesivas.

## Arquitectura

```
Evento de dominio (crear/pagar/cancelar reserva, cron)
        │
        ▼
BookingsService / BookingsCronService
        │  (inyectan) 
        ▼
NotificationsService.emit(...)  ──►  Prisma: Notification (fan-out a destinatarios)
        ▲                                   │
        │ GET/PATCH (scope por rol)         │
NotificationsController ◄───────────────────┘
        ▲
        │ HTTP (api-client)
Frontend: hooks react-query (polling)
   ├── useNotifications()        → GET /notifications (lista paginada)
   ├── useUnreadCount()          → GET /notifications/unread-count (refetchInterval)
   ├── useMarkRead()/useMarkAllRead() → PATCH
   ├── NotificationBell (navbar)  → badge con contador
   └── /dashboard/notifications   → centro de notificaciones
```

## Modelo de datos

### Enum `NotificationType`
```
BOOKING_CREATED        // N1 / N7 nueva reserva
BOOKING_PAID           // N2 reserva pagada
BOOKING_CANCELLED      // N3 cancelada (cliente o admin)
BOOKING_AUTO_CANCELLED // N5 cancelación automática por impago (cron)
RECURRING_CREATED      // N4 turno fijo creado
NEW_CLIENT             // N6 primer booking de un cliente en la sede
COMMISSION_EARNED      // N8 comisión generada (cron, admin general)
VENUE_OR_FACILITY_CREATED // N9 alta de complejo/cancha (admin general)
USER_REGISTERED        // N10 nuevo usuario (admin general)
```

### Modelo `Notification`
```prisma
model Notification {
  id          String           @id @default(uuid())
  type        NotificationType
  title       String
  body        String
  // Scope / destinatario:
  venueId     String?          @map("venue_id")   // sede a la que pertenece (null = global)
  adminOnly   Boolean          @default(false) @map("admin_only") // solo admin general
  // Relaciones de contexto (para navegar / mostrar):
  bookingId   String?          @map("booking_id")
  // Datos extra serializados (montos, labels AR, nombres) para render sin más queries:
  data        Json?
  createdAt   DateTime         @default(now()) @map("created_at")

  venue Venue?             @relation(fields: [venueId], references: [id], onDelete: Cascade)
  reads NotificationRead[]

  @@index([venueId, createdAt])
  @@index([adminOnly, createdAt])
  @@map("notifications")
}
```

### Modelo `NotificationRead` (estado de lectura POR USUARIO)
```prisma
model NotificationRead {
  id             String   @id @default(uuid())
  notificationId String   @map("notification_id")
  userId         String   @map("user_id")
  readAt         DateTime @default(now()) @map("read_at")

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([notificationId, userId]) // un registro de lectura por usuario y notificación
  @@index([userId])
  @@map("notification_reads")
}
```

**Decisión de modelado — fan-out por scope + lecturas por usuario:**
- Se guarda **una fila `Notification` por evento** con su scope (`venueId` y/o `adminOnly`). La consulta resuelve el destinatario:
  - Admin de sede: `venueId = su venueId`.
  - Admin general: todas (cualquier `venueId`) + `adminOnly = true`.
- El estado "leída" es **por usuario** vía la tabla `NotificationRead`. Una notificación está "leída para el usuario X" si existe una fila `NotificationRead(notificationId, userId=X)`. Así, cuando una notif de sede la ven el venue admin y el admin general, cada uno tiene su propio estado de lectura independiente.
- Esto soporta correctamente varios admins por sede desde el arranque.

**Cálculo de no leídas:** por usuario = (notificaciones en su scope) menos (las que tienen un `NotificationRead` de ese usuario). Se resuelve con un `where` que excluye las que tienen lectura del usuario (`reads: { none: { userId } }`).

### Relaciones nuevas
- `Venue`: agregar `notifications Notification[]`.
- `User`: agregar `notificationReads NotificationRead[]`.

## Backend — módulo `notifications`

### `NotificationsService`

**Emisión (lo usan BookingsService y crons):**
```ts
emit(input: {
  type: NotificationType;
  title: string;
  body: string;
  venueId?: string | null;
  adminOnly?: boolean;
  bookingId?: string;
  data?: Record<string, unknown>;
}): Promise<void>   // best-effort: try/catch interno, nunca lanza
```

Helpers de conveniencia para no repetir el armado de labels (reusan la lógica AR de `toEmailData`):
- `notifyBookingCreated(booking)` → emite N1/N7 (venueId de la cancha). `data` incluye labels AR, cliente, cancha, sede, monto base y total.
- `notifyBookingPaid(booking)` → N2.
- `notifyBookingCancelled(booking, reason, auto=false)` → N3 o N5 según `auto`.
- `notifyRecurringCreated(recurring, facility, createdCount)` → N4.
- `notifyNewClient(venueId, clientName)` → N6 (ver detección abajo).
- `notifyCommissionEarned(venueId, amount)` → N8.
- `notifyVenueOrFacilityCreated(...)` → N9.
- `notifyUserRegistered(user)` → N10.

**Detección de "nuevo cliente" (N6):** al crear una reserva, consultar si el cliente ya tenía reservas previas en esa sede (`count` de bookings del user en facilities de ese venue, excluyendo la actual). Si es 0 → emitir N6.

**Consulta (scope por rol + lectura por usuario):**
```ts
list(user, page, limit)   // where por scope de rol, orderBy createdAt desc, paginado.
                          //   Cada item incluye `read: boolean` (si existe NotificationRead del user).
unreadCount(user)         // count en scope del rol AND reads: { none: { userId: user.id } }
markRead(user, id)        // valida scope; upsert NotificationRead(notificationId, userId)
markAllRead(user)         // crea NotificationRead para todas las de su scope aún sin leer por él
```

Where por **scope de rol** (idéntico criterio al de bookings):
```ts
// VENUE_ADMIN:
scopeWhere = { venueId: user.venueId }
// ADMIN general: ve todo (sin filtro de scope)
scopeWhere = {}
```

Where de **no leídas por usuario** (se combina con el scope):
```ts
{ ...scopeWhere, reads: { none: { userId: user.id } } }
```

`markAllRead`: traer los ids del scope sin lectura del usuario y `createMany` de `NotificationRead` (con `skipDuplicates`) para ese userId. `markRead`: `upsert` por la unique `(notificationId, userId)` para ser idempotente.

### `NotificationsController`
- `GET /notifications?page&limit` — `@Roles(ADMIN, VENUE_ADMIN)`
- `GET /notifications/unread-count` — idem
- `PATCH /notifications/:id/read` — idem
- `PATCH /notifications/read-all` — idem
- Todos con `JwtAuthGuard` + `RolesGuard`, `@CurrentUser()` para el scope.

### Integración con eventos existentes
Inyectar `NotificationsService` en `BookingsService` y `BookingsCronService`. En cada punto donde hoy se dispara un email (`void this.mailService.send...`), agregar en paralelo `void this.notificationsService.notify...` (best-effort, sin `await` que bloquee).

Puntos de emisión:
- `create` / `createManual` → `notifyBookingCreated` (+ chequeo N6).
- `markAsPaid` → `notifyBookingPaid` (hueco actual, no manda nada hoy).
- `cancel` → `notifyBookingCancelled(auto=false)`.
- `createRecurring` → `notifyRecurringCreated`.
- cron `cancelUnpaidRecurringBookings` → `notifyBookingCancelled(auto=true)` por reserva (idempotente: esas reservas ya pasan a CANCELLED, no se re-procesan).
- cron `completePastPaidBookings` → `notifyCommissionEarned` por sede (idempotente: esas reservas pasan a COMPLETED, no se re-procesan; se puede agrupar por venue).
- auth/register y venue/facility create → N10/N9 (cuando apliquen).

## Frontend

### Hooks (`frontend/src/hooks/use-notifications.ts`)
```ts
useNotifications()      // useQuery ["notifications"], GET /notifications
useUnreadCount()        // useQuery ["notifications","unread"], refetchInterval: 30s (polling)
useMarkRead()           // useMutation PATCH :id/read → invalida ["notifications"], ["notifications","unread"]
useMarkAllRead()        // useMutation PATCH read-all → idem
```

Polling: `useUnreadCount` con `refetchInterval: 30000` y `refetchOnWindowFocus: true`. Es el único que hace polling; la lista se refetchea al abrir la página y al marcar leídas.

### Badge de campana (`NotificationBell`)
Componente con ícono `Bell` + badge numérico cuando `unreadCount > 0`. Se ubica en el navbar del panel admin (`dashboard/layout.tsx`). Al hacer clic navega a `/dashboard/notifications` (v1 simple; un dropdown de "últimas 5" queda como mejora futura).

### Centro de notificaciones (`/dashboard/notifications`)
Reemplaza el placeholder. Lista notificaciones con:
- Ícono por `type` (lucide: Calendar, DollarSign, XCircle, Repeat, UserPlus, TrendingUp, Building2).
- Título, cuerpo, tiempo relativo ("hace 5 min") en hora AR.
- Fondo destacado si `readAt == null`.
- Clic en una no leída → `markRead`; si tiene `bookingId` → navega al detalle.
- Botón "Marcar todas como leídas".
- Paginación / "ver más".
- Estado vacío = el actual.

## Manejo de errores
- **Emisión**: `NotificationsService.emit` envuelve todo en try/catch y loguea; nunca propaga. La reserva/pago/cancelación se completa aunque falle la notif.
- **Consulta**: endpoints estándar; 403 si el rol no corresponde; 404 si la notif no está en el scope del usuario al marcar leída.
- **Frontend**: si el polling falla, el badge mantiene el último valor; no se muestra error intrusivo.

## Consideraciones de performance
- Índices en `Notification(venueId, createdAt)` y `(adminOnly, createdAt)`; en `NotificationRead(userId)` y unique `(notificationId, userId)` para resolver "leída por usuario" rápido.
- Polling cada 30s sobre un `count` liviano (no trae filas); el `reads: { none: ... }` usa el índice de `NotificationRead`.
- La lista se trae paginada (10–20 por página), nunca todo.
- Fan-out por scope (1 fila por evento) evita multiplicar filas por admin.

## Testing (verificación)
- Verificar build backend (`npx nest build`) y frontend (`npx next build`).
- Prueba manual: crear/pagar/cancelar una reserva como cliente y confirmar que aparece la notificación en el panel del admin de la sede y del admin general, con el scope correcto (el venue admin de otra sede NO la ve).
- Verificar que el badge se actualiza por polling y que "marcar todas" pone el contador en 0.
- Verificar montos: venue admin ve base; admin general ve total/comisión.
