# Plan de implementación — Billetera de puntos

Orden pensado para que cada paso se pueda probar solo. La base (1–3) se prueba entera en transacciones
`BEGIN … ROLLBACK` **antes** de aplicarla; la migración real (con el borrado irreversible) se aplica recién en
el paso 4, junto con las Edge Functions y el frontend.

- [ ] 1. Migración 043 — modelo de datos
  - [ ] 1.1 Tablas `wallets`, `wallet_transactions` (enum `wallet_tx_kind`), con `CHECK` de saldo ≥ 0, signo por tipo y motivo obligatorio; índices únicos de pago y devolución por reserva.
    - _Requisitos: 1.1, 1.2, 2.3, 2.5, 3.4, 6.3, 6.5, 10.1, 10.3_
  - [ ] 1.2 Tablas `venue_settlements` y `venue_ledger` (enum `venue_ledger_kind`), con `UNIQUE (venue_id, period)`, comprobante obligatorio e índice único de crédito por reserva.
    - _Requisitos: 4.2, 4.4, 8.3, 8.5_
  - [ ] 1.3 Trigger que crea la billetera al dar de alta un perfil + backfill con saldo 0 para los usuarios existentes.
    - _Requisitos: 1.1, 9.3_
  - [ ] 1.4 RLS: sin escritura por la API; lectura de `wallets`/`wallet_transactions` propia o ADMIN; `venue_ledger`/`venue_settlements` sin lectura directa. `wallets` en la publicación de Realtime.
    - _Requisitos: 1.7, 5.5, 6.7, 10.1_
  - [ ] 1.5 Bucket privado `settlement-receipts` (5 MB, imagen/PDF) con políticas: sube ADMIN; lee ADMIN o el VENUE_ADMIN de la carpeta `{venue_id}`.
    - _Requisitos: 8.3, 8.6_
  - [ ] 1.6 Redondeo: `calculate_price` con comisión entera; redondear `pricing.price_per_hour` existente y agregar `CHECK` de pesos enteros.
    - _Requisitos: 10.3 (D9)_
  - [ ] 1.7 Arranque en limpio: borrar notificaciones de reservas, `booking_price_changes`, `bookings` y `recurring_bookings`.
    - _Requisitos: 9.1, 9.2_

- [ ] 2. Migración 043 — funciones que mueven puntos
  - [ ] 2.1 `wallet_apply` (bloqueo `FOR UPDATE`, `balance_after`, error `SALDO_INSUFICIENTE` con necesario/disponible/faltante).
    - _Requisitos: 1.2, 2.2, 2.3, 2.5, 10.2_
  - [ ] 2.2 `create_booking_paid`: precio + reserva PAID + descuento en una transacción.
    - _Requisitos: 2.1, 2.2, 2.4, 2.10_
  - [ ] 2.3 `pay_booking`: solo el dueño, solo PENDING, precio esperado (`PRECIO_CAMBIO`), idempotente.
    - _Requisitos: 2.7, 2.8, 2.9, 2.10_
  - [ ] 2.4 `cancel_booking`: cancela (compare-and-set) y devuelve lo pagado si hubo pago; sin movimientos si estaba pendiente.
    - _Requisitos: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [ ] 2.5 `wallet_admin_adjust`: solo ADMIN, recarga o ajuste negativo, motivo obligatorio, nunca saldo negativo.
    - _Requisitos: 6.3, 6.4, 6.5, 6.7_
  - [ ] 2.6 Trigger `credit_venue_on_complete`: crédito +base con comisión al pasar a COMPLETED, una sola vez, con el mes de liquidación (mes actual si el del turno ya se liquidó).
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 8.7_
  - [ ] 2.7 `settle_venue_month`: solo ADMIN, mes cerrado (AR), monto calculado, comprobante obligatorio, deja el mes en 0.
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ] 2.8 Revisar `guard_booking_payment` (028) y el reprecio (029/030) para que convivan con las funciones nuevas.
    - _Requisitos: 2.8, 10.1_

- [ ] 3. Migración 043 — lecturas y pruebas
  - [ ] 3.1 RPCs paginadas: `my_wallet_history`, `venue_wallet` (sin `commission` para el admin de sede), `admin_points_users`, `admin_wallet_history`, `admin_balances` (con verificación de cuadre).
    - _Requisitos: 1.3–1.6, 5.2–5.5, 6.2, 6.6, 7.2–7.4_
  - [ ] 3.2 Script de pruebas en `BEGIN … ROLLBACK` con los 8 grupos del diseño (sección 7), como cliente, admin de sede y admin. Todo verde antes de seguir.
    - _Requisitos: 2.5, 3.4, 4.2, 7.4, 8.5, 10.1, 10.2_

- [ ] 4. Edge Functions + aplicar la migración
  - [ ] 4.1 `_shared/wallet-errors.ts`: códigos de la base → HTTP (402 saldo, 409 precio/horario, 403) y mensaje en español.
    - _Requisitos: 2.2, 10.4_
  - [ ] 4.2 `create-booking`: reserva propia con `create_booking_paid`; la manual de admin sigue PENDING.
    - _Requisitos: 2.1, 2.2, D4_
  - [ ] 4.3 `mark-paid`: cobra con `pay_booking`.
    - _Requisitos: 2.7, 2.8, 2.9_
  - [ ] 4.4 `cancel-booking` y `cancel-recurring`: usan `cancel_booking` (devolución); emails con "Te devolvimos X puntos".
    - _Requisitos: 3.1, 3.2, 3.3, 10.5_
  - [ ] 4.5 `create-recurring` y emails de confirmación/pago: mencionan los puntos.
    - _Requisitos: 10.5, D3_
  - [ ] 4.6 Aplicar la migración 043 en producción (borra las reservas) y desplegar las Edge Functions.
    - _Requisitos: 9.1_

- [ ] 5. Frontend — piezas compartidas
  - [ ] 5.1 `lib/points.ts` (`formatPoints`, número de WhatsApp, `whatsappTopupUrl`), `components/shared/points-amount.tsx` (verde `+` / rojo `−`, accesible) y `components/shared/whatsapp-topup-button.tsx`.
    - _Requisitos: 1.5, 11.1–11.5_
  - [ ] 5.2 `hooks/use-wallet.ts`: saldo con Realtime, historial, ajuste, balances, liquidación; tipos en `database.types.ts`.
    - _Requisitos: 1.3, 1.8, 6, 7, 8_
  - [ ] 5.3 Formulario de tarifas: solo pesos enteros (Zod + campo).
    - _Requisitos: 10.3 (D9)_

- [ ] 6. Frontend — cliente
  - [ ] 6.1 Saldo en el navbar (vista de cliente) con link a "Mi billetera".
    - _Requisitos: 1.8_
  - [ ] 6.2 Página `/wallet` "Mi billetera": saldo, WhatsApp con cantidad, tabla con filtros de fecha y tipo, paginada.
    - _Requisitos: 1.3–1.6, 11.2, 11.3_
  - [ ] 6.3 Reservar: precio en puntos + saldo; bloqueo y aviso de saldo insuficiente con WhatsApp por lo que falta; manejo del 402.
    - _Requisitos: 2.2, 2.6, 11.2, 11.3_
  - [ ] 6.4 Botón "Pagar X pts" (Mis reservas, turnos fijos e inicio) con confirmación de saldo antes/después; 402 y 409.
    - _Requisitos: 2.7, 2.8_
  - [ ] 6.5 Cancelación: el modal avisa cuántos puntos se devuelven.
    - _Requisitos: 3.2_

- [ ] 7. Frontend — administración
  - [ ] 7.1 Menú: "Billetera" (VENUE_ADMIN) y "Puntos" (ADMIN) después de "Dashboard"; "Balances" (ADMIN) después de "Puntos".
    - _Requisitos: 5.1, 6.1, 7.1_
  - [ ] 7.2 `/dashboard/wallet` (admin de sede): tarjetas, tabla con filtros, "Ver comprobante" (URL firmada).
    - _Requisitos: 5.1–5.5, 8.6_
  - [ ] 7.3 `/dashboard/points` (admin general): buscador de usuarios, modal "Ajustar puntos" con motivo y confirmación, historial global con filtros.
    - _Requisitos: 6.1–6.7_
  - [ ] 7.4 `/dashboard/balances` (admin general): tarjetas, tabla sede × mes, modal "Registrar pago" con comprobante.
    - _Requisitos: 7.1–7.4, 8.1–8.6_

- [ ] 8. Cierre
  - [ ] 8.1 Build (`tsc`, `next build`), deploy y push a `origin` y `sportarg`.
  - [ ] 8.2 Prueba de punta a punta en producción con una cuenta de prueba: recarga → reserva → cancelación → reserva → turno jugado → liquidación; verificar el cuadre de Balances.
  - [ ] 8.3 Actualizar `negocio.md` con las reglas de la billetera.
