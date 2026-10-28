# Requisitos — Notificaciones in-app para administradores

## Introducción

Hoy la plataforma solo tiene notificaciones por **email dirigidas al cliente** (confirmación, cancelación, recordatorio) y un centro de notificaciones que es un **placeholder estático** (`/dashboard/notifications` muestra "Sin notificaciones"). **Ningún evento notifica al administrador general ni al administrador de sede.**

Este spec define un sistema de **notificaciones in-app** (dentro del panel) para los dos roles de administración:

- **Admin general (`ADMIN`)**: ve notificaciones de **todas** las sedes, más las notificaciones exclusivas del negocio (comisión de la empresa).
- **Admin de sede (`VENUE_ADMIN`)**: ve solo las notificaciones de **su** sede (filtrado por `facility.venueId`), con montos en **precio base** (sin comisión), según las reglas de negocio.

El objetivo es que el administrador se entere, sin depender del email, de lo que pasa en su operación: nuevas reservas, pagos, cancelaciones, turnos que vencen por falta de pago, y resúmenes relevantes.

## Análisis: notificaciones propuestas

A partir de los eventos reales del dominio (en `bookings.service.ts` y `bookings-cron.service.ts`), estas son las notificaciones que tiene sentido informar. Se clasifican por evento, destinatario y prioridad.

### Para el admin de sede (VENUE_ADMIN) — sobre su sede

| # | Evento | Cuándo se dispara | Contenido |
|---|--------|-------------------|-----------|
| N1 | **Nueva reserva** | Un cliente crea una reserva (única) en una cancha de su sede | Cliente, cancha, fecha/hora, monto base |
| N2 | **Reserva pagada** | Una reserva pasa a `PAID` (`markAsPaid`) | Cliente, cancha, fecha/hora, monto base |
| N3 | **Reserva cancelada por el cliente** | El cliente cancela una reserva de su sede | Cliente, cancha, fecha/hora, motivo |
| N4 | **Turno fijo creado** | Se crea un turno fijo (recurrente) en su sede | Cliente, cancha, día/horario, cantidad de fechas |
| N5 | **Cancelación automática por falta de pago** | El cron cancela una reserva de turno fijo impaga (<24h) | Cliente, cancha, fecha/hora |
| N6 | **Nuevo cliente que reserva por primera vez** | Un cliente hace su primera reserva en su sede | Nombre del cliente |

### Para el admin general (ADMIN) — además de lo anterior, a nivel plataforma

| # | Evento | Cuándo se dispara | Contenido |
|---|--------|-------------------|-----------|
| N7 | **Nueva reserva (cualquier sede)** | Igual que N1 pero de cualquier complejo | Sede, cliente, cancha, fecha/hora, monto total |
| N8 | **Comisión generada** | Un turno pagado finaliza (se reconoce comisión de la empresa) | Sede, monto de comisión |
| N9 | **Nuevo complejo / cancha creada** | Se da de alta un complejo o instalación | Nombre del complejo/cancha |
| N10 | **Nuevo usuario registrado** | Un usuario se registra en la plataforma | Nombre del usuario |

### Notas de alcance

- **No** se duplica el email: las notificaciones in-app son un canal adicional para el administrador (los emails al cliente siguen igual).
- La **prioridad** de implementación es N1, N2, N3, N5 (operación diaria del admin de sede) y N7 (admin general). El resto (N4, N6, N8, N9, N10) son deseables pero secundarias.
- Las notificaciones de **cron** (N5, N8) deben ser idempotentes (no duplicar), siguiendo el patrón `reminderSentAt` ya usado.

---

## Requisitos

### Requisito 1 — Modelo y persistencia de notificaciones

**Historia:** Como plataforma, quiero persistir las notificaciones con su destinatario y scope, para poder mostrarlas a cada administrador según su rol y sede.

#### Criterios de aceptación
1. CUANDO se cree una notificación ENTONCES el sistema DEBERÁ guardar: tipo, título, cuerpo, datos asociados (ej. bookingId, venueId), destinatario (rol y/o usuario), y estado de leída.
2. CUANDO una notificación corresponda a una sede ENTONCES el sistema DEBERÁ registrar el `venueId` para poder filtrarla por sede.
3. CUANDO una notificación sea solo para el admin general ENTONCES el sistema DEBERÁ marcarla como de alcance global/solo-admin.
4. El sistema DEBERÁ registrar `createdAt` y `readAt` (nullable) por notificación.

### Requisito 2 — Emisión de notificaciones desde los eventos del dominio

**Historia:** Como administrador, quiero que las acciones relevantes generen una notificación automáticamente, para enterarme sin revisar manualmente.

#### Criterios de aceptación
1. CUANDO un cliente cree una reserva (única) ENTONCES el sistema DEBERÁ generar una notificación para el admin de la sede correspondiente y para el admin general.
2. CUANDO una reserva pase a pagada ENTONCES el sistema DEBERÁ notificar al admin de la sede.
3. CUANDO una reserva sea cancelada (por cliente o admin) ENTONCES el sistema DEBERÁ notificar al admin de la sede.
4. CUANDO el cron cancele una reserva por falta de pago ENTONCES el sistema DEBERÁ generar una notificación (sin duplicar en corridas sucesivas).
5. CUANDO se cree un turno fijo ENTONCES el sistema DEBERÁ notificar al admin de la sede.
6. SI la generación de una notificación falla ENTONCES la operación de negocio (reserva/pago/cancelación) NO DEBERÁ fallar (best-effort, igual que los emails).

### Requisito 3 — Scope por rol al consultar

**Historia:** Como admin de sede, quiero ver solo las notificaciones de mi sede; como admin general, quiero ver todas.

#### Criterios de aceptación
1. CUANDO un VENUE_ADMIN consulte sus notificaciones ENTONCES el sistema DEBERÁ devolver únicamente las de su `venueId`.
2. CUANDO un ADMIN general consulte ENTONCES el sistema DEBERÁ devolver las de todas las sedes más las de alcance global.
3. CUANDO un CLIENT intente acceder a las notificaciones de administración ENTONCES el sistema DEBERÁ denegar el acceso.

### Requisito 4 — API de notificaciones

**Historia:** Como frontend del panel, quiero endpoints para listar, contar no leídas y marcar como leídas.

#### Criterios de aceptación
1. El sistema DEBERÁ exponer `GET /notifications` paginado (`{ data, meta }`), ordenado por más reciente primero, respetando el scope por rol.
2. El sistema DEBERÁ exponer `GET /notifications/unread-count` que devuelva la cantidad de no leídas del usuario.
3. El sistema DEBERÁ exponer `PATCH /notifications/:id/read` para marcar una como leída.
4. El sistema DEBERÁ exponer `PATCH /notifications/read-all` para marcar todas como leídas.
5. Todos los endpoints DEBERÁN requerir autenticación y rol ADMIN o VENUE_ADMIN.

### Requisito 5 — Centro de notificaciones (UI)

**Historia:** Como administrador, quiero ver y gestionar mis notificaciones en el panel.

#### Criterios de aceptación
1. CUANDO el administrador abra `/dashboard/notifications` ENTONCES el sistema DEBERÁ listar sus notificaciones (más recientes primero), diferenciando visualmente las no leídas.
2. CUANDO haya notificaciones ENTONCES cada ítem DEBERÁ mostrar ícono por tipo, título, descripción y tiempo relativo (ej. "hace 5 min").
3. CUANDO el administrador haga clic en una notificación no leída ENTONCES el sistema DEBERÁ marcarla como leída.
4. CUANDO el administrador use "marcar todas como leídas" ENTONCES el sistema DEBERÁ marcarlas todas y actualizar el contador.
5. CUANDO no haya notificaciones ENTONCES el sistema DEBERÁ mostrar el estado vacío actual.
6. SI una notificación está asociada a una reserva ENTONCES al hacer clic DEBERÁ poder navegar al detalle correspondiente.

### Requisito 6 — Indicador de no leídas (campana)

**Historia:** Como administrador, quiero ver un indicador de notificaciones nuevas sin entrar a la página.

#### Criterios de aceptación
1. CUANDO haya notificaciones no leídas ENTONCES el panel DEBERÁ mostrar un contador (badge) visible en la navegación del admin.
2. CUANDO cambie la cantidad de no leídas ENTONCES el contador DEBERÁ actualizarse periódicamente (polling) sin recargar la página.
3. CUANDO el administrador marque notificaciones como leídas ENTONCES el contador DEBERÁ reflejarlo.

### Requisito 7 — Consistencia con reglas de negocio

**Historia:** Como negocio, quiero que los montos y la zona horaria de las notificaciones respeten las reglas ya definidas.

#### Criterios de aceptación
1. CUANDO una notificación muestre un monto para el admin de sede ENTONCES DEBERÁ usar el **precio base** (sin comisión).
2. CUANDO una notificación muestre fecha/hora ENTONCES DEBERÁ expresarse en **hora de Argentina (UTC-3)**.
3. CUANDO una notificación de admin general muestre comisión ENTONCES DEBERÁ usar `commissionAmount`.
