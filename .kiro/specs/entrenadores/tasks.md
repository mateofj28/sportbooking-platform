# Tareas — Entrenadores

Entrega por etapas: cada etapa deja algo usable y se prueba, se aplica y se publica antes de la siguiente.
Flujo de cada tarea con base: probar en `BEGIN … ROLLBACK` → aplicar → deploy de Edge Functions → `tsc` +
`next build` → commit → push a `origin` y `sportarg`.

## Etapa 1 — Alta del entrenador y su panel (sin reservas todavía)

- [x] 1.1 Migración 064: `ADD VALUE 'TRAINER'` al enum `role`.
  - _Req. 2, E9_
- [x] 1.2 Migración 065 (parte 1): config de clases en `sports` (`classes_enabled`, `class_durations`,
  `class_max_students`); tablas `trainers`, `trainer_sports`, `trainer_slots`, `trainer_slot_sports`,
  `trainer_blocks`; enum `trainer_status`; CHECKs; triggers (superposición de franjas, deportes válidos,
  `guard_trainer_commission`); RLS por rol (admin de sede sin acceso); `set_user_role` acepta TRAINER.
  - _Req. 1, 2, 3, 4.1–4.7, 13, E17, E22_
- [x] 1.3 RPC: `trainer_upsert_profile`, `trainer_set_published` (checklist 3.2), `admin_set_trainer_status`,
  `admin_trainers` (lista paginada con filtros) y `admin_trainer_detail`.
  - _Req. 2.3, 3, 11.1_
- [x] 1.4 Edge: `admin-create-user` acepta `role: 'TRAINER'` y crea la fila `trainers` (DRAFT); validación de
  datos obligatorios (DNI, teléfono). "Hacer entrenador" a un cliente existente (`admin-set-role`).
  `_shared/permissions.ts` reconoce TRAINER.
  - _Req. 2.1, 2.5, E5, E6_
- [x] 1.5 Frontend roles: `TRAINER` en tipos y auth store; `dashboard/layout` lo deja entrar; sidebar con su menú;
  navbar con el cambio "Panel" / "Vista de cliente" para TRAINER.
  - _Req. 2.6, 10.1, E7_
- [x] 1.6 Pantallas del entrenador: Perfil (con Publicar/Despublicar y checklist), Disponibilidad (franjas con
  deportes, lugar, tarifas, % solo lectura y precio final), Bloqueos.
  - _Req. 3, 4_
- [x] 1.7 Pantallas del admin general: Deportes (config de clases), Entrenadores (lista, alta, detalle con % de
  comisión editable por franja, suspender/reactivar), Usuarios (crear entrenador / hacer entrenador).
  - _Req. 1, 2, 11.1_
- [x] 1.8 Cierre de etapa: pruebas en la base, build, deploy, push. `negocio.md` con las reglas de la etapa.

## Etapa 2 — Reservar una clase única

- [x] 2.1 Migración: `trainer_classes`, `class_bookings` (EXCLUDE, cupo, unique por alumno), `class_price`,
  `trainer_availability`, `search_trainers`, `book_class`, `cancel_class_booking`, `cancel_trainer_class`,
  `wallet_transactions.class_booking_id`; RLS.
  - _Req. 5, 6, 7, 9_
- [x] 2.2 Edge: `create-class-booking`, `cancel-class-booking`, `cancel-trainer-class`; errores `TR00x` traducidos.
  - _Req. 7, 9_
- [x] 2.3 Cliente: `/entrenadores` (lista y filtros), `/entrenadores/[id]` (perfil, día, duración, horarios,
  confirmar con saldo), pestaña **Clases** en Mis reservas, detalle y cancelación. Navegación "Entrenadores".
  - _Req. 5, 6, 7, 9, E21_
- [x] 2.4 Entrenador: Mis clases (próximas / historial, alumnos, cancelar). Admin: Clases (todas, filtros,
  cancelar).
  - _Req. 10.2, 11.2_
- [x] 2.5 Cierre de etapa (incluye prueba de concurrencia por el último lugar y por el mismo horario).

## Etapa 3 — Clases fijas y cambios del entrenador

- [ ] 3.1 Migración: `recurring_classes`, `pay_class_bookings_batch`, `class_booking_changes`,
  `reprice_pending_class_bookings` + trigger en `trainer_slots` (precio, lugar, movimiento de horario,
  cancelación si no entra).
  - _Req. 8, 4.6, E15, E23_
- [ ] 3.2 Edge: `create-recurring-class` (pay_mode ALL/NEXT/NONE, rollback), `cancel-recurring-class`,
  `pay-class-bookings`; `cron-cancel-unpaid` y `cron-notify-price-changes` incluyen clases.
  - _Req. 8_
- [ ] 3.3 Frontend: crear clase fija con las 3 opciones de pago, Pagar / Pagar todo, aviso de cambios
  (`PriceChangeNote` para clases), cancelar la serie.
  - _Req. 8_
- [ ] 3.4 Cierre de etapa (casos de reprecio: cambio de tarifa, de lugar, de horario dentro y fuera de la franja,
  franja que cruza medianoche, clase grupal con fechas pagadas y sin pagar).

## Etapa 4 — Dinero, avisos y estadísticas

- [ ] 4.1 Migración: `trainer_ledger`, `trainer_settlements`, `trainer_payout_requests`, `complete_past_classes`
  (pg_cron) + acreditación al terminar, RPC de billetera y pagos del entrenador, totales 057 extendidos y
  verificados; notificaciones (`trainer_id`, `trainer_only`, tipos nuevos, RLS).
  - _Req. 10.3–10.5, 11.3, 11.5, 12, 13.4, E18_
- [ ] 4.2 Edge: `cron-send-reminders` con clases (cliente y entrenador); emails de reserva, cancelación y
  recordatorio para clases; avisos in-app.
  - _Req. 12_
- [ ] 4.3 Frontend: Billetera del entrenador (solicitar pago); Solicitudes de pago y Balances con
  **Complejos / Entrenadores**; Notificaciones del entrenador; Estadísticas de entrenadores (admin y propio);
  `my_booking_stats` del cliente con clases.
  - _Req. 10.3, 11.3, 11.4, 11.5_
- [ ] 4.4 Cierre del spec: prueba de punta a punta en producción con cuentas de prueba (alta → publicar →
  reservar → cancelar → clase fija → cambio de franja → clase jugada → solicitud y pago), cuadre de Balances,
  RLS por rol (incluido el admin de sede), `negocio.md` y `diseno.md` actualizados.
