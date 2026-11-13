# Diseño — Billetera de puntos

Basado en `requirements.md` (decisiones D1–D10). Sigue los principios del proyecto: **la base es la garantía**
(saldo, atomicidad, idempotencia y permisos viven en Postgres), las Edge Functions orquestan y mandan
emails/notificaciones, y el frontend solo muestra y llama.

## 1. Idea central

Todo movimiento de puntos es una **fila inmutable en un libro** (ledger). El saldo es un número guardado
junto al usuario que se actualiza **en la misma transacción** que inserta el movimiento, con el registro del
saldo bloqueado (`SELECT … FOR UPDATE`). Así:

- dos pagos simultáneos se ejecutan uno detrás del otro y el segundo ve el saldo ya descontado (R2.5);
- un `CHECK (balance >= 0)` hace imposible el saldo negativo aunque haya un bug (R1.1, R2.3);
- índices únicos por reserva hacen imposible pagar o devolver dos veces (R3.4) y acreditar dos veces a la sede (R4.2).

Hay dos libros: el de **clientes** (`wallet_transactions`) y el de **sedes** (`venue_ledger`). La empresa no tiene
libro propio: su ganancia es la comisión registrada en cada acreditación a sede, y el dinero recaudado sale de
las recargas.

```
Cliente ──recarga (admin)──▶ wallet  +X
Cliente ──paga reserva────▶ wallet  −total            (total = base + comisión)
Cancela ──devolución──────▶ wallet  +total pagado
Turno jugado (COMPLETED) ─▶ venue_ledger +base, commission = comisión   (trigger)
Liquidación mensual ──────▶ venue_ledger −monto del mes                 (admin)
```

## 2. Modelo de datos (migración 043)

### 2.1 Billetera del cliente

```sql
CREATE TABLE wallets (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE wallet_tx_kind AS ENUM ('TOPUP', 'ADJUSTMENT', 'BOOKING_PAYMENT', 'BOOKING_REFUND');

CREATE TABLE wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind          wallet_tx_kind NOT NULL,
  amount        bigint NOT NULL CHECK (amount <> 0),      -- con signo: + suma, − resta
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  detail        text NOT NULL,                             -- texto ya armado ("Reserva — Cancha 1, Simulación 1, 14/11 18:00")
  reason        text,                                      -- motivo del admin (recarga/ajuste)
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- El signo depende del tipo
  CHECK ((kind = 'TOPUP'           AND amount > 0)
      OR (kind = 'ADJUSTMENT'      AND amount < 0)
      OR (kind = 'BOOKING_PAYMENT' AND amount < 0)
      OR (kind = 'BOOKING_REFUND'  AND amount > 0)),
  -- Recargas y ajustes llevan motivo
  CHECK (kind NOT IN ('TOPUP', 'ADJUSTMENT') OR char_length(btrim(reason)) BETWEEN 3 AND 300)
);
-- (booking_id puede quedar NULL si algún día se borra la reserva; el historial conserva `detail`.)
-- Una reserva se paga una vez y se devuelve una vez (R2, R3.4)
CREATE UNIQUE INDEX wallet_tx_one_payment ON wallet_transactions(booking_id) WHERE kind = 'BOOKING_PAYMENT';
CREATE UNIQUE INDEX wallet_tx_one_refund  ON wallet_transactions(booking_id) WHERE kind = 'BOOKING_REFUND';
CREATE INDEX ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX ON wallet_transactions(created_at DESC);
```

- `TOPUP` = recarga (suma); `ADJUSTMENT` = resta del admin (corrección). Sumar siempre es recarga (D7).
- `detail` se guarda armado para que el historial no dependa de que la reserva siga existiendo.
- La billetera se crea sola: trigger en `profiles` (alta) + backfill para los usuarios existentes (saldo 0).

### 2.2 Libro de la sede y liquidaciones

```sql
CREATE TYPE venue_ledger_kind AS ENUM ('BOOKING_CREDIT', 'SETTLEMENT');

CREATE TABLE venue_settlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  period       date NOT NULL CHECK (period = date_trunc('month', period)::date),  -- 1er día del mes
  amount       bigint NOT NULL CHECK (amount > 0),
  transfer_ref text CHECK (transfer_ref IS NULL OR char_length(btrim(transfer_ref)) BETWEEN 1 AND 120),
  receipt_path text,                                     -- objeto en el bucket privado "settlement-receipts"
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, period),                             -- un mes no se liquida dos veces (R8.5)
  CHECK (transfer_ref IS NOT NULL OR receipt_path IS NOT NULL)   -- comprobante obligatorio (R8.3)
);

CREATE TABLE venue_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  kind          venue_ledger_kind NOT NULL,
  amount        bigint NOT NULL CHECK (amount <> 0),     -- + crédito (base), − liquidación
  commission    bigint NOT NULL DEFAULT 0 CHECK (commission >= 0),   -- ganancia de la empresa (solo créditos)
  period        date NOT NULL,                           -- mes de liquidación (1er día, hora AR)
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES venue_settlements(id) ON DELETE RESTRICT,
  detail        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'BOOKING_CREDIT' AND amount > 0 AND settlement_id IS NULL
      OR kind = 'SETTLEMENT' AND amount < 0 AND commission = 0 AND settlement_id IS NOT NULL)
);
CREATE UNIQUE INDEX venue_ledger_one_credit ON venue_ledger(booking_id) WHERE kind = 'BOOKING_CREDIT';  -- R4.2
CREATE INDEX ON venue_ledger(venue_id, created_at DESC);
CREATE INDEX ON venue_ledger(venue_id, period);
```

Saldo pendiente de una sede = `SUM(amount)` de su libro (créditos − liquidaciones).

### 2.3 Permisos (RLS)

- **Nadie escribe** estas tablas por la API: sin políticas de INSERT/UPDATE/DELETE. Solo las funciones
  `SECURITY DEFINER` de la sección 3 (R10.1).
- Lectura directa: `wallets` y `wallet_transactions` → el propio usuario o el ADMIN. `venue_ledger` y
  `venue_settlements` **no** se leen directo (la columna `commission` no debe llegarle al admin de sede, R5.5):
  se leen con RPCs que eligen columnas según el rol.
- `wallets` entra a la publicación de Realtime para que el saldo del navbar se actualice solo.

### 2.4 Bucket privado de comprobantes

`settlement-receipts`: privado, 5 MB, imagen o PDF. Ruta `"{venue_id}/{period}/{archivo}"`.
Subir: solo ADMIN. Leer: ADMIN, o VENUE_ADMIN cuyo `venue_id` es la primera carpeta (R8.6). Se muestran con
URL firmada de corta duración.

### 2.5 Redondeo y arranque en limpio

- `calculate_price`: `commission := ROUND(base * profit_percent / 100)` (sin decimales) (D9).
- `pricing.price_per_hour`: se redondea lo existente y se agrega `CHECK (price_per_hour = round(price_per_hour))`.
  El formulario de tarifas pasa a pedir pesos enteros.
- Arranque en limpio (R9, irreversible): `DELETE` de `notifications` de tipos de reserva, `booking_price_changes`,
  `bookings` y `recurring_bookings`. No toca usuarios, complejos, canchas, horarios, tarifas, bloqueos ni publicidad.

## 3. Funciones de la base (`SECURITY DEFINER`, `search_path = public`)

Cada una corre en una sola transacción. Los errores de negocio se lanzan con `RAISE EXCEPTION` en español y
un código propio en `DETAIL`/`HINT` para que la Edge Function los traduzca a HTTP (402/409/403).

| Función | Quién la llama | Qué hace |
|---|---|---|
| `wallet_apply(user, kind, amount, booking, detail, reason, by)` | interna | Bloquea `wallets` del usuario (`FOR UPDATE`), calcula el saldo nuevo, inserta el movimiento con `balance_after`. Si queda < 0 → `SALDO_INSUFICIENTE` con necesario/disponible/faltante. Base de todas las demás. |
| `create_booking_paid(facility, user, start, end, notes, by)` | `create-booking` (reserva propia) | `calculate_price` → `INSERT bookings (CONFIRMED, PAID)` → `wallet_apply(−total)`. Si falta saldo o el horario se ocupó, no queda nada (R2.1–2.4). Los triggers de integridad de 025 siguen validando horario/bloqueos/superposición. |
| `pay_booking(booking, user, expected_total)` | `mark-paid` (botón Pagar) | Bloquea la reserva; exige dueño = user, `CONFIRMED + PENDING`, precio = esperado (si no, `PRECIO_CAMBIO` con el precio nuevo, R2.8); `wallet_apply(−total)`; marca `PAID`. Si ya estaba pagada, responde OK (idempotente). |
| `cancel_booking(booking, by, reason)` | `cancel-booking`, `cancel-recurring` | Bloquea la reserva; exige `CONFIRMED`; la cancela y, si hay un `BOOKING_PAYMENT`, inserta el `BOOKING_REFUND` por **lo pagado** (R3.2). Permisos y regla de 24 h se siguen evaluando en la Edge Function (`permissions.ts`), antes de llamar. |
| `wallet_admin_adjust(user, amount, reason)` | frontend del ADMIN (RPC directa) | Exige `is_admin()`. `amount > 0` → `TOPUP`; `< 0` → `ADJUSTMENT` (falla si deja negativo, D7). Motivo obligatorio. |
| `credit_venue_on_complete()` | trigger `AFTER UPDATE OF status ON bookings` | Cuando pasa a `COMPLETED` y está `PAID`: inserta `BOOKING_CREDIT` (+base, commission) con `ON CONFLICT DO NOTHING` (R4). `period` = mes AR del fin del turno; si ese mes ya está liquidado, el mes actual (R8.7). |
| `settle_venue_month(venue, period, transfer_ref, receipt_path)` | frontend del ADMIN (RPC directa) | Exige `is_admin()`, mes ya terminado (AR) y al menos un comprobante. Suma los créditos de ese mes sin liquidar; si es 0 → error. Inserta `venue_settlements` + fila `SETTLEMENT` (−monto) (R8). El `UNIQUE (venue_id, period)` frena el doble registro. |

Lecturas (RPC, paginadas en el servidor con el mismo patrón que `admin_list_bookings`):

| Función | Para | Devuelve |
|---|---|---|
| `my_wallet_history(from, to, kind, page, size)` | cliente | saldo + movimientos propios |
| `venue_wallet(venue, from, to, kind, page, size)` | VENUE_ADMIN (su sede) y ADMIN | saldo pendiente, acreditado del mes, movimientos **sin** `commission` para el admin de sede |
| `admin_points_users(search, page, size)` | ADMIN | usuarios con saldo y total gastado (pagos − devoluciones) |
| `admin_wallet_history(from, to, kind, user, venue, page, size)` | ADMIN | recargas, ajustes y liquidaciones (historial global, R6.6) |
| `admin_balances()` | ADMIN | recaudado, en billeteras, comisión, pagado y pendiente a sedes; tabla por sede × mes con estado |

`admin_balances` también devuelve la verificación de R7.4 (recaudado = en billeteras + gastado neto); las
pruebas la usan para detectar descuadres.

## 4. Edge Functions

| Función | Cambio |
|---|---|
| `create-booking` | Reserva propia → `rpc('create_booking_paid')`. Reserva manual de admin para un cliente → igual que hoy (`PENDING`, D4). `SALDO_INSUFICIENTE` → **402** con `{ needed, available, missing }`. |
| `mark-paid` | Pasa a cobrar con puntos: `rpc('pay_booking')`. Mismo contrato (`booking_id`, `expected_total`); nuevos errores 402 (saldo) y 409 (precio). El nombre no cambia para no tocar el frontend de más. |
| `cancel-booking` | Tras validar permisos y 24 h, `rpc('cancel_booking')`. El email de cancelación dice "Te devolvimos X puntos" si correspondía. |
| `cancel-recurring` | Para cada fecha futura `CONFIRMED`: `rpc('cancel_booking')` (devuelve las pagadas). |
| `create-recurring` | Sin cambios de lógica (fechas `PENDING`); el email dice que cada fecha se paga con puntos. |
| `cron-cancel-unpaid` | Sin cambios (solo toca `PENDING`: no hay puntos que devolver, R3.6). |
| `cron-complete-bookings` | Sin cambios: la acreditación la hace el trigger de la base al pasar a `COMPLETED`. |
| `_shared/wallet-errors.ts` | Nuevo: traduce los códigos de las funciones a HTTP y mensaje en español. |

## 5. Frontend

### 5.1 Rutas y menú

| Rol | Ruta | Menú |
|---|---|---|
| Cliente (y admins en vista de cliente) | `/wallet` — "Mi billetera" | navbar: saldo "1.250 pts" + link |
| VENUE_ADMIN | `/dashboard/wallet` — "Billetera" | después de "Dashboard" |
| ADMIN | `/dashboard/points` — "Puntos" | después de "Dashboard" |
| ADMIN | `/dashboard/balances` — "Balances" | después de "Puntos" |

### 5.2 Pantallas

- **Mi billetera**: tarjeta de saldo; botón "Cargar puntos por WhatsApp" con campo de cantidad; `DataTable` de
  movimientos (fecha/hora AR, detalle, monto verde/rojo) con filtros de rango (`DateRangePicker`) y tipo.
- **Reservar**: el resumen muestra "Precio: 63.000 pts · Tu saldo: 70.000 pts". Si no alcanza, el botón queda
  deshabilitado con aviso y botón de WhatsApp por lo que falta. Si el servidor responde 402 (otra pestaña gastó
  el saldo), se muestra el mismo aviso.
- **Pagar** (Mis reservas / inicio): "Pagar 63.000 pts", con confirmación que muestra saldo antes y después.
- **Billetera de sede**: tarjetas "Pendiente de cobro" y "Acreditado este mes"; tabla con turnos jugados (+) y
  pagos de la empresa (−) con "Ver comprobante".
- **Puntos (ADMIN)**: buscador + `DataTable` de usuarios (saldo, gastado); modal "Ajustar puntos" (Sumar/Restar,
  cantidad, motivo obligatorio, confirmación con saldo resultante); pestaña "Historial global".
- **Balances (ADMIN)**: tarjetas (recaudado, en billeteras, comisión, pagado, pendiente); tabla sede × mes con
  estado y botón "Registrar pago" (modal: monto fijo calculado, número de transferencia, archivo de comprobante).

### 5.3 Piezas compartidas

- `lib/points.ts`: `formatPoints(n)` → "63.000 pts"; `WHATSAPP_NUMBER = "5492984339319"`;
  `whatsappTopupUrl(points, email)` → `https://wa.me/5492984339319?text=Hola%2C%20quiero%20comprar…` (R11).
- `hooks/use-wallet.ts`: saldo (con Realtime sobre `wallets`), historial, ajuste, balances, liquidación.
- `components/shared/points-amount.tsx`: monto con signo y color (verde `+`, rojo `−`), accesible (no depende
  solo del color: lleva el signo y texto para lectores de pantalla).
- `lib/error-messages.ts`: mensajes de `SALDO_INSUFICIENTE` y `PRECIO_CAMBIO` ya vienen en español desde la base.

## 6. Casos borde

| Caso | Comportamiento |
|---|---|
| Doble clic en "Pagar" / dos pestañas | `FOR UPDATE` + índice único: se cobra una vez; la segunda responde "ya pagada". |
| Reservar con saldo justo en dos canchas a la vez | La segunda falla con saldo insuficiente; no queda reserva creada. |
| Horario ocupado al confirmar | La reserva no se crea y no se descuenta nada (misma transacción). |
| Cancelar dos veces | La segunda falla ("ya está cancelada"); el índice único impide una segunda devolución. |
| El cron completa dos veces | `ON CONFLICT DO NOTHING`: una sola acreditación. |
| Turno de octubre completado en noviembre con octubre ya liquidado | Se acredita a noviembre (R8.7). |
| Admin resta más de lo que hay | Rechazado: "El cliente tiene X puntos; no se puede restar Y". |
| Se borra un usuario | `ON DELETE CASCADE` en su billetera; el libro de sedes conserva el `detail` armado. |
| Cambio de tarifa con fechas pendientes | El reprecio (029/030) ya usa `calculate_price` redondeado; el pago exige el precio vigente. |

## 7. Pruebas

En transacciones `BEGIN … ROLLBACK` contra la base (patrón del proyecto), como cliente, admin de sede y admin:

1. Recarga, ajuste negativo, ajuste que dejaría negativo (rechazado), motivo vacío (rechazado).
2. Reserva propia con saldo (descuenta, queda PAID), sin saldo (no crea nada), con horario ocupado (no descuenta).
3. Pago de pendiente: OK, doble pago, precio cambiado, pago de reserva ajena (rechazado).
4. Cancelación con devolución (cliente ≥ 24 h, admin), cancelación de pendiente (sin movimientos), doble cancelación.
5. Completar turno → crédito a la sede con comisión; doble completado → un solo crédito.
6. Liquidación: mes en curso (rechazada), mes cerrado (OK, deja en 0), doble liquidación (rechazada), sin comprobante (rechazada).
7. Permisos: un cliente no puede insertar movimientos ni leer los de otro; el admin de sede no ve `commission`.
8. Cuadre de `admin_balances` después de todos los pasos.

## 8. Despliegue

1. Migración 043 (tablas, funciones, triggers, bucket, redondeo, **borrado de reservas**). Es un cambio que
   rompe el flujo actual de pago, así que se aplica junto con las Edge Functions y el frontend en la misma tanda.
2. Deploy de Edge Functions (`create-booking`, `mark-paid`, `cancel-booking`, `cancel-recurring`, `create-recurring`).
3. Push del frontend (Vercel). Hasta que Vercel publique, el botón "Pagar" viejo llama a `mark-paid` nuevo, que
   ya cobra con puntos: no se puede pagar sin saldo.
