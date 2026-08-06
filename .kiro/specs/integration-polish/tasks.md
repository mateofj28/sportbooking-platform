# Integration Polish — Tasks

## T1: Integrar ConfirmModal en todas las acciones de eliminar
- Sports: antes de eliminar un deporte
- Facilities: antes de eliminar una instalación
- Venues: antes de eliminar una sede
- Users: antes de desactivar un usuario
- Blocked Slots: antes de eliminar un bloqueo
- Schedules: antes de eliminar un horario
- Pricing: antes de eliminar un precio

## T2: Integrar Toast en todas las acciones CRUD exitosas
- Crear/Editar/Eliminar sport → toast "Deporte creado/actualizado/eliminado"
- Crear/Editar/Eliminar facility → toast
- Crear/Editar/Eliminar venue → toast
- Confirmar/Cancelar booking → toast
- Crear reserva manual → toast
- Desactivar usuario → toast
- Crear/Eliminar schedule → toast
- Crear/Eliminar pricing → toast
- Crear/Eliminar blocked slot → toast

## T3: Paginación en GET /bookings (backend)
- Agregar page/limit al bookings repository y controller
- Devolver { data, meta: { total, page, limit, totalPages } }

## T4: Paginación en GET /facilities (backend)
- Agregar page/limit al facilities repository y controller

## T5: Paginación UI en tablas admin (frontend)
- Admin Bookings: botones Anterior/Siguiente con page state
- Admin Facilities: mismo
- Admin Users: ya soporta paginación en backend, solo cablear en UI
