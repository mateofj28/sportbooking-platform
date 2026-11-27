# Diseño — Entrenadores

Referencia: `requirements.md` (decisiones E1–E23, requisitos 1–13). Reutiliza la billetera (043/045/054/057),
los turnos fijos (create-recurring), el reprecio (029/030), los crons (050/060) y las notificaciones (046/047).

## 1. Principios

- **La base garantiza las reglas** (cupo, superposición, anticipación, precio, comisión, dinero). Las Edge
  Functions validan permisos, llaman a funciones SQL atómicas y mandan emails/avisos (best-effort).
- **Tablas paralelas, no genéricas.** Las clases no se mezclan con `bookings` de canchas: tienen otra forma
  (varios alumnos, tarifa × horas, sin cancha). Los complejos siguen exactamente igual. Donde el admin general
  necesita ver todo junto (Balances, Solicitudes, historial), las funciones de lectura **unen** ambas fuentes.
- **El dinero usa la misma billetera** del cliente (`wallets`, `wallet_transactions`). Así el cuadre de Balances
  (057) sigue valiendo sin fórmulas nuevas.
- **Contexto por ruta** (negocio.md): `/dashboard` = gestión (entrenador, admins); el resto = vista de cliente,
  también para el entrenador (E7).

## 2. Modelo de datos

### 2.1 Rol y deportes

- `ALTER TYPE public.role ADD VALUE 'TRAINER'` en una migración **propia** (no se puede usar el valor nuevo en la
  misma transacción que lo agrega).
- `set_user_role`: suma `'TRAINER'` a la lista (sin `venue_id`). `admin-create-user` acepta `role: 'TRAINER'`.
- `sports` suma: `classes_enabled bool DEFAULT false`, `class_durations smallint[]` (horas enteras, ej. `{1,2}`;
  CHECK valores 1..8, sin repetidos, no vacío si `classes_enabled`), `class_max_students smallint DEFAULT 1`
  (CHECK 1..50). Solo el admin general los edita (RLS de `sports` ya es solo ADMIN).

### 2.2 Entrenador

```
trainers                       -- extiende profiles (1 a 1)
  user_id        uuid PK → profiles ON DELETE RESTRICT
  status         trainer_status ('DRAFT' | 'PUBLISHED' | 'SUSPENDED') DEFAULT 'DRAFT'
  bio            text   CHECK ≤ 300
  experience     text   CHECK ≤ 1000
  published_at, suspended_at timestamptz, suspended_reason text, created_by uuid, created_at, updated_at

trainer_sports (trainer_id, sport_id) PK — solo deportes con classes_enabled (trigger)

trainer_slots                  -- franjas semanales (Req. 4)
  id, trainer_id, day_of_week 0..6 (0 = lunes), start_time, end_time "HH:MM" (AR; puede cruzar medianoche)
  location        text NOT NULL (1..200)
  rate_individual integer NOT NULL > 0          -- $/hora
  rate_group      integer NULL  > 0             -- $/hora por persona (obligatoria si un deporte de la franja es grupal)
  commission_percent numeric(5,2) NOT NULL 1..100 -- lo define el admin general (2.4)
  is_active, created_at, updated_at
trainer_slot_sports (slot_id, sport_id) PK      -- deportes que da en esa franja (⊆ trainer_sports)

trainer_blocks                 -- bloqueos (Req. 4.7)
  id, trainer_id, start_date date, end_date date (días AR, inclusive), reason text, created_at
```

- Superposición de franjas del mismo día (4.4): trigger que compara en minutos AR (con cruce de medianoche).
- Bloqueo con clases reservadas (4.8, E16): trigger en `trainer_blocks` que rechaza si hay clases no
  canceladas en esos días AR, y devuelve cuáles (DETAIL json).

### 2.3 Clases y reservas de clase

```
trainer_classes                -- una clase concreta (Req. glosario)
  id, trainer_id, sport_id
  start_datetime, end_datetime timestamptz   -- horas enteras, end - start = hours
  hours          smallint
  is_group       bool          -- sport.class_max_students > 1 al crearla
  capacity       smallint      -- copia del cupo del deporte al crearla (3 de Req. 1: cambiar el deporte no afecta)
  location       text          -- copia del lugar de la franja
  slot_id        uuid NULL → trainer_slots ON DELETE SET NULL
  status         class_status ('OPEN' | 'CANCELLED' | 'COMPLETED')
  cancelled_at, cancelled_by, cancellation_reason, created_at, updated_at
  EXCLUDE USING gist (trainer_id WITH =, tstzrange(start_datetime, end_datetime) WITH &&)
          WHERE (status <> 'CANCELLED')           -- 7.4: nunca dos clases a la vez
  CHECK end > start, hours = duración, ≤ 24 h

class_bookings                 -- el lugar de UN cliente en una clase
  id, class_id → trainer_classes, user_id → profiles
  status         booking_status   ('CONFIRMED' | 'CANCELLED' | 'COMPLETED')   -- mismo enum que canchas
  payment_status payment_status   ('PENDING' | 'PAID'); paid_at
  base_price     numeric(10,2)    -- tarifa × horas (lo del entrenador)
  commission_amount numeric(10,2) -- redondeada al peso
  total_price    numeric(10,2)    -- base + comisión
  recurring_class_id uuid NULL → recurring_classes ON DELETE SET NULL
  reminder_sent_at, cancelled_at, cancelled_by, cancelled_by_role text ('CLIENT'|'TRAINER'|'ADMIN'|'SYSTEM'),
  cancellation_reason, created_by, created_at, updated_at
  UNIQUE (class_id, user_id) WHERE status <> 'CANCELLED'   -- 7.5

recurring_classes              -- clase fija (Req. 8)
  id, trainer_id, user_id, sport_id, slot_id, day_of_week, start_time, hours,
  start_date, end_date, is_active, created_by, created_at, updated_at
```

- **Cupo (7.3):** toda inscripción toma `SELECT … FROM trainer_classes WHERE id = … FOR UPDATE` y cuenta las
  reservas no canceladas antes de insertar. Dos clientes por el último lugar se serializan en esa fila.
- **Crear la clase de un horario (E14):** se serializa con `pg_advisory_xact_lock('trainer:'||trainer_id)`; si
  ya existe una clase en ese inicio, se usa (si es grupal, mismo deporte y misma duración); si no, se crea. El
  EXCLUDE es la última barrera.
- **Fechas sin pagar ocupan lugar (8.6):** cuentan en el cupo como cualquier reserva no cancelada.

### 2.4 Comisión (E17)

- Trigger `guard_trainer_commission` en `trainer_slots`, igual que `guard_pricing_commission` (063): si quien
  escribe no es admin general, no puede cambiar `commission_percent`; al crear una franja hereda el % de su
  franja más reciente (si no tiene, 10%). El admin general lo edita desde Entrenadores.
- El entrenador ve el % en solo lectura y el precio final al cliente.

### 2.5 Precio

`class_price(p_slot, p_sport, p_hours, p_is_group) → {base, commission, total}`:
`base = (is_group ? rate_group : rate_individual) × hours`; `commission = round(base × % / 100)`;
`total = base + commission`. Sin tarifa aplicable → error "La franja no tiene tarifa para este tipo de clase".

### 2.6 Dinero del entrenador

Paralelo exacto a los complejos (043/045):

```
trainer_ledger           (trainer_id, kind 'CLASS_CREDIT' | 'SETTLEMENT', amount, commission,
                          class_booking_id UNIQUE WHERE kind='CLASS_CREDIT', settlement_id, detail, created_at)
trainer_settlements      (trainer_id, amount > 0, transfer_ref, receipt_path, created_by, created_at)
trainer_payout_requests  (trainer_id, amount, status PENDING|PAID|REJECTED, …; una PENDING por entrenador)
```

- `wallet_transactions` suma `class_booking_id uuid NULL → class_bookings`, con CHECK "`booking_id` o
  `class_booking_id`, no los dos" para los kinds `BOOKING_PAYMENT`/`BOOKING_REFUND`, y unique de un pago y una
  devolución por reserva de clase. Se reutilizan los mismos kinds: el cliente ve "Reserva" / "Devolución" y los
  totales 057 (`spent_net`) ya los cuentan.
- `business_totals_shards` (057) suma `pending_to_trainers` y `paid_to_trainers`; `played` y `commission` suman
  también las clases. Triggers nuevos en `trainer_ledger` y `trainer_settlements`; `business_totals_verify` los
  incluye. El cuadre `recaudado = billeteras + gastado` no cambia.
- Comprobantes: mismo bucket `settlement-receipts`, carpeta `trainers/<trainer_id>/`.

### 2.7 Notificaciones

- `notifications` suma `trainer_id uuid NULL → profiles` y `trainer_only bool DEFAULT false`.
- RLS nueva: `notifications_select_trainer` = `trainer_id = auth.uid()`. La del admin general pasa a
  `is_admin() AND NOT trainer_only` (no le llegan los recordatorios del entrenador). La del admin de sede no
  cambia (exige `venue_id` de su sede; las de entrenadores tienen `venue_id NULL`) → E22.
- Tipos nuevos: `TRAINER_PUBLISHED`, `CLASS_BOOKED`, `CLASS_CANCELLED`, `CLASS_AUTO_CANCELLED`,
  `CLASS_REMINDER` (trainer_only), `TRAINER_PAYOUT_REQUESTED`, `TRAINER_PAYOUT_PAID`, `TRAINER_PAYOUT_REJECTED`.

## 3. Funciones de la base (RPC)

Todas `SECURITY DEFINER`, validan el rol adentro, errores con los códigos de la billetera (`WL00x`) y uno nuevo
`TR00x` para reglas de clases (traducidos en `_shared/` y `lib/error-messages.ts`).

| Función | Quién | Qué hace |
|---|---|---|
| `trainer_upsert_profile(bio, experience, sport_ids[])` | TRAINER | Perfil propio (Req. 3) |
| `trainer_set_published(p_publish bool)` | TRAINER | Publica si cumple 3.2; despublica. Emite `TRAINER_PUBLISHED` |
| `admin_set_trainer_status(trainer, status, reason)` | ADMIN | Suspender / reactivar (2.3) |
| `trainer_availability(trainer, date, sport, hours)` | todos | Horarios del día (Req. 6): franjas ∩ deporte, pasos de 1 h, ventana 48 h AR, fuera < 24 h y > 30 días, bloqueos, clases existentes (llena / se pisa / grupal con lugares) |
| `search_trainers(sport, dow, min, max, page, size)` | todos | Publicados y no suspendidos, con precio final mínimo y días; paginado (Req. 5) |
| `book_class(p_user, trainer, sport, start, hours, expected_total, p_pay)` | Edge | Valida todo, encuentra/crea la clase, inscribe, cobra (si `p_pay`). Atómico (Req. 7) |
| `pay_class_bookings_batch(ids[], user)` | Edge | Igual a `pay_bookings_batch` (054) |
| `cancel_class_booking(id, by, role, reason)` | Edge | Cancela + devuelve 100% (Req. 9) |
| `cancel_trainer_class(class, by, role, reason)` | Edge | Cancela la clase y todas sus reservas, devolviendo |
| `complete_past_classes()` | pg_cron | Clases y reservas pagadas terminadas → COMPLETED; trigger acredita al entrenador |
| `reprice_pending_class_bookings(slot)` | trigger | E23 / 4.6 / 8.7 (ver 5) |
| `request_trainer_payout`, `pay_trainer`, `reject_trainer_payout`, `trainer_wallet` | TRAINER / ADMIN | Paralelo a 045 |
| `trainer_my_classes(filtros, page)` | TRAINER | Panel "Mis clases" (10.2) |
| `admin_trainers(filtros, page)`, `admin_trainer_detail(id)`, `admin_class_bookings(filtros, page)` | ADMIN | Req. 11.1–11.2 |
| `admin_trainer_balances`, `admin_trainer_payments` + `admin_payout_pending_count` / `admin_balances_summary` extendidos | ADMIN | Req. 11.3 |
| `get_trainer_stats(range, trainer, sport)` | ADMIN, TRAINER (lo suyo) | Req. 11.4 con las reglas AR de get_stats |
| `my_booking_stats` extendida | todos | Suma las clases del usuario como cliente (o columna aparte) |

## 4. Edge Functions

| Función | Hace |
|---|---|
| `create-class-booking` | Auth → `book_class(p_pay = true)` → email al cliente y al entrenador, aviso `CLASS_BOOKED` |
| `create-recurring-class` | Igual a `create-recurring`: 8 fechas, salta conflictos, `pay_mode` ALL/NEXT/NONE, rollback si falla el pago |
| `cancel-class-booking` | Cliente (24 h, `appliesClientRules`), entrenador (cualquier momento, motivo obligatorio), admin. Emails + aviso |
| `cancel-trainer-class` | Entrenador o admin: cancela la clase entera, avisa a cada alumno |
| `cancel-recurring-class` | Igual a `cancel-recurring` |
| `pay-class-bookings` | Pagar fechas pendientes (1 o "Pagar todo", con `expected_total`) |
| `admin-create-user` | Acepta `role: 'TRAINER'` y crea su fila en `trainers` (DRAFT) |
| `cron-cancel-unpaid` | Suma `class_bookings` sin pagar (mismas dos reglas que canchas) |
| `cron-send-reminders` | Suma recordatorio de clase al cliente (email) y al entrenador (email + `CLASS_REMINDER`) |
| `cron-notify-price-changes` | Suma los cambios de E23 (`class_booking_changes`) en el mismo email agrupado |

`_shared/permissions.ts`: `Role` suma `'TRAINER'`; `actorFromUser` lo reconoce (hoy lo trataría como CLIENT).
Regla nueva `canManageClass(actor, classTrainerId)`: el entrenador de la clase o el admin general.

## 5. Cambios del entrenador sobre reservas sin pagar (E23, 4.6, 8.7)

Trigger `trainer_slot_changed` (AFTER UPDATE/DELETE en `trainer_slots`) → `reprice_pending_class_bookings(slot)`:

1. Toma las `class_bookings` **sin pagar** de clases fijas de esa franja, que empiezan en más de 24 h, `FOR UPDATE`.
2. **Precio y lugar:** recalcula con `class_price`; actualiza precio y, si la clase solo tiene reservas sin pagar,
   el lugar de la clase.
3. **Horario:** si cambió el inicio de la franja, calcula la nueva posición manteniendo el desplazamiento desde el
   inicio (18–21 → 19–22: 18:00 pasa a 19:00). La reserva se mueve a la clase de ese horario (la crea o se suma,
   con las mismas reglas de 2.3).
4. Si la nueva posición no entra en la franja, se pisa con otra clase o un bloqueo, queda a < 24 h, o la franja se
   borró o ya no da ese deporte → la reserva se **cancela** (`cancelled_by_role = 'SYSTEM'`).
5. Registra el cambio en `class_booking_changes` (precio, lugar, horario viejos y nuevos; `notified_at`). El cron
   de avisos manda un email agrupado por cliente después de 5 min sin cambios (como 029).
6. Las reservas **pagadas** no se tocan. Si una clase queda sin reservas activas, pasa a `CANCELLED`.

## 6. Permisos (RLS) — resumen

| Tabla | Cliente | Entrenador | Admin general | Admin de sede |
|---|---|---|---|---|
| `trainers` | publicados (campos públicos) | la suya | todo | nada |
| `trainer_slots`, `trainer_slot_sports`, `trainer_sports` | de publicados | las suyas (CRUD; % solo lectura) | todo | nada |
| `trainer_blocks` | nada (la disponibilidad sale por RPC) | los suyos | todo | nada |
| `trainer_classes` | nada directo (por RPC) | las suyas | todo | nada |
| `class_bookings` | las propias | las de sus clases (sin DNI/teléfono del alumno) | todo | nada |
| `recurring_classes` | las propias | las de sus clases | todo | nada |
| `trainer_ledger`, `trainer_settlements`, `trainer_payout_requests` | nada | por RPC (lo suyo, sin comisión) | por RPC | nada |

Escritura de reservas, pagos y cancelaciones: solo por las funciones de 3 / Edge Functions (sin políticas
INSERT/UPDATE directas), como `bookings`.

## 7. Frontend

### 7.1 Navegación (`lib/navigation.ts`)

- Vista de cliente: `entrenamientos` → **"Entrenadores"** (`/entrenadores`, `available: true`).
- `navbar`: el cambio "Panel" / "Vista de cliente" aparece también para `TRAINER`.
- `admin-sidebar`: ítems con `only: 'TRAINER'` (Inicio, Mis clases, Disponibilidad, Bloqueos, Perfil,
  Billetera, Notificaciones); el entrenador no ve ningún ítem de complejos. El admin general suma
  **Entrenadores** y **Clases**.
- `dashboard/layout.tsx`: deja entrar a `TRAINER`; cada página de gestión valida su rol (como hoy).

### 7.2 Pantallas

| Ruta | Quién | Contenido |
|---|---|---|
| `/entrenadores` | cliente | Lista con filtros deporte / día / precio, paginada (`search_trainers`) |
| `/entrenadores/[id]` | cliente | Perfil, tarifas finales, lugares; selector de día (30 días, hora AR, `lib/clock.ts`) + duración + horarios (`trainer_availability`); confirmar con precio y saldo; aviso de clase fija y "no se podrá cancelar" no aplica (siempre ≥ 24 h) |
| `/bookings` | cliente | Pestaña nueva **Clases** (únicas y fijas), Pagar / Pagar todo, cancelar |
| `/dashboard` (entrenador) | entrenador | Próximas clases, ganancias del mes, saldo |
| `/dashboard/trainer/classes` | entrenador | Mis clases (próximas / historial), alumnos, cancelar |
| `/dashboard/trainer/availability` | entrenador | Franjas (deportes, lugar, tarifas; % solo lectura y precio final) |
| `/dashboard/trainer/blocks` | entrenador | Bloqueos (`DateRangePicker`, límites AR) |
| `/dashboard/trainer/profile` | entrenador | Perfil + Publicar / Despublicar con checklist (3.2) |
| `/dashboard/trainer/wallet` | entrenador | Igual a la billetera de sede (solicitar pago) |
| `/dashboard/trainers` | admin | Lista, alta, detalle (franjas con % editable, bloqueos, clases, cancelaciones), suspender |
| `/dashboard/classes` | admin | Todas las reservas de clase con filtros |
| `/dashboard/points` → Solicitudes de pago | admin | Selector **Complejos / Entrenadores** |
| `/dashboard/balances`, `/dashboard/statistics` | admin | Suman entrenadores (Req. 11.3–11.4) |
| `/dashboard/sports` | admin | Configuración de clases por deporte (Req. 1) |
| `/dashboard/users` | admin | Crear con rol Entrenador; "Hacer entrenador" a un cliente |

Todas siguen `diseno.md` (DataTable, Chip flat, DatePicker con límites, botones, español AR, fechas
`lib/datetime.ts`, reloj `lib/clock.ts`).

## 8. Migraciones previstas

1. `064_role_trainer.sql` — `ADD VALUE 'TRAINER'` (sola).
2. `065_trainers_schema.sql` — tablas 2.1–2.3, 2.6, enums, índices, EXCLUDE, CHECKs, triggers de validación
   (superposición de franjas, bloqueos con clases, deportes de la franja), guard de comisión, RLS.
3. `066_trainers_money.sql` — `wallet_transactions.class_booking_id`, ledger/settlements/payouts del entrenador,
   totales 057 extendidos (con recarga inicial), comprobantes.
4. `067_trainers_rpc.sql` — funciones de 3 (precio, disponibilidad, búsqueda, reservar, pagar, cancelar,
   completar, reprecio, billetera, listados y estadísticas).
5. `068_trainers_notifications_crons.sql` — columnas y RLS de notificaciones, tipos, cron
   `complete-past-classes`, `class_booking_changes`.

Cada una se prueba dentro de `BEGIN … ROLLBACK` antes de aplicarla (casos: cupo concurrente, superposición,
24 h, bloqueos, reprecio y movimiento de horario, cuadre de Balances, RLS por rol incluido el admin de sede).

## 9. Riesgos y decisiones abiertas

- **Volumen de trabajo:** es la funcionalidad más grande hasta ahora (5 migraciones, ~8 Edge Functions,
  ~12 pantallas). Se propone entregar por etapas usables (ver tasks.md).
- **Emails:** sin verificar el dominio de Resend, los emails a clientes y entrenadores no llegan (E3).
- **Reprecio con movimiento de horario (5.3):** es la parte más delicada; se prueba con casos de franjas que
  cruzan medianoche y clases grupales compartidas entre fechas pagadas y sin pagar.
