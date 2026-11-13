# Requisitos — Billetera de puntos

## Introducción

Hoy el botón "Pagar" solo marca la reserva como pagada: no hay dinero ni saldo detrás. Este spec reemplaza
ese pago simbólico por una **billetera interna de puntos**:

- **1 punto = 1 peso argentino (ARS).** Los puntos no vencen.
- Los puntos son el **único medio de pago** de las reservas.
- El **admin general** es la cámara de compensación: recibe el dinero real de las recargas (por fuera de la
  app, ej. transferencia), carga los puntos a mano y liquida cada mes a los complejos.
- El complejo gana el **precio base** del turno; la empresa retiene la **comisión**. El cliente paga
  base + comisión (igual que hoy: `total_price = base_price + commission_amount`).

Decisiones tomadas con el dueño del negocio (respuestas a las preguntas abiertas):

| # | Tema | Decisión |
|---|---|---|
| D1 | Cancelación del cliente | Se mantiene el límite de **24 h**; si cancela, recupera el **100%** de los puntos. |
| D2 | Cancelación por un admin | El cliente recupera el **100%** de los puntos. |
| D3 | Turnos fijos | Se crean pendientes; **cada fecha se paga con puntos** desde "Mis reservas" (botón Pagar). Si no se paga, se cancela sola como hoy (menos de 24 h antes). |
| D4 | Reserva manual de un admin para un cliente | Queda pendiente; **el cliente la paga con sus puntos**. |
| D5 | Admins que reservan como clientes | **Pagan con puntos**, con las mismas reglas que un cliente. |
| D6 | Liquidación mensual | El sistema calcula lo del mes (turnos completados del 1 al último día, hora AR); el admin registra el pago por **ese monto exacto** con comprobante. Sin pagos parciales. |
| D7 | Ajustes manuales | Una resta nunca deja el saldo en negativo. "Recaudado" = recargas − restas. |
| D8 | Reservas existentes | **Se borran todas** para arrancar en limpio. |
| D9 | Redondeo | La comisión se redondea al peso; las tarifas base son pesos enteros. |
| D10 | Cómo cargar puntos | Botón de **WhatsApp** a +54 9 2984 33-9319 con "quiero comprar X puntos". |

Quedan **fuera de alcance** (pendientes del documento original): devolución en dinero real de los puntos
cargados, cobro automático de turnos fijos, vencimiento de puntos, recarga online (Mercado Pago).

## Glosario

- **Billetera del cliente**: saldo de puntos de un usuario (cliente o admin que reserva como cliente).
- **Movimiento**: cada suma o resta de puntos, con fecha, detalle y monto. Nunca se borra ni se edita.
- **Recarga**: suma de puntos hecha por el admin general (dinero real recibido).
- **Ajuste negativo**: resta de puntos hecha por el admin general (corrección).
- **Billetera de la sede**: puntos que el complejo generó con turnos jugados y todavía no se le pagaron.
- **Liquidación**: pago mensual del admin general a un complejo, con comprobante.
- **Mes de liquidación**: mes calendario en hora de Argentina según el día en que **terminó** el turno
  (misma regla que el reconocimiento de ingresos de estadísticas).

---

## Requisito 1 — Billetera y movimientos del cliente

**Historia:** como cliente, quiero ver mis puntos y todos sus movimientos, para saber cuánto tengo y en qué los usé.

1. EL sistema DEBE mantener para cada usuario un saldo de puntos entero, que nunca sea negativo.
2. EL saldo DEBE ser siempre igual a la suma de los movimientos del usuario (la base lo garantiza).
3. CUANDO el cliente abre "Mi billetera", EL sistema DEBE mostrar el saldo disponible y una tabla de movimientos
   con: fecha y hora (hora AR), detalle y monto.
4. EL detalle DEBE indicar el tipo: "Recarga", "Ajuste", "Reserva" (pago) o "Devolución" (cancelación), y para
   reservas, la cancha, el complejo y la fecha del turno.
5. EL monto DEBE mostrarse en **verde con "+"** cuando suma y en **rojo con "−"** cuando resta.
6. LA tabla DEBE poder filtrarse por rango de fechas y por tipo, y paginarse en el servidor.
7. UN usuario SOLO DEBE poder ver su propia billetera y sus propios movimientos.
8. EL saldo DEBE verse también en el menú del usuario (navbar) en la vista de cliente.

## Requisito 2 — Pago de una reserva con puntos

**Historia:** como cliente, quiero pagar mis reservas con mis puntos, para confirmarlas sin trámites.

1. CUANDO un usuario crea una reserva **para sí mismo** (única), EL sistema DEBE descontar el `total_price` de
   su billetera en la misma operación que crea la reserva, y la reserva DEBE quedar pagada.
2. SI el saldo no alcanza, EL sistema DEBE rechazar la reserva sin crearla, sin descontar nada, y mostrar:
   "Saldo insuficiente: necesitás X puntos y tenés Y. Te faltan Z." junto con cómo cargar puntos.
3. NO DEBE permitirse pago parcial ni saldo negativo.
4. EL descuento y la reserva DEBEN ser atómicos: si falla uno, no ocurre ninguno (ej. el horario se ocupó).
5. Dos pagos simultáneos del mismo usuario NO DEBEN poder gastar el mismo saldo dos veces.
6. ANTES de confirmar, la pantalla de reserva DEBE mostrar el precio en puntos y el saldo actual, y avisar si
   no alcanza (sin esperar al error del servidor).
7. CUANDO la reserva está pendiente (turno fijo o reserva manual de un admin), el **dueño** DEBE poder pagarla
   con puntos con el botón "Pagar" desde "Mis reservas" y el inicio. Mismas reglas de saldo (2.2–2.5).
8. SI el precio de una fecha pendiente cambió (reprecio de turnos fijos, migración 029/030), EL pago DEBE
   cobrar el precio vigente y rechazar si el cliente confirmó con un precio distinto (como hoy `expected_total`).
9. SOLO el dueño de la reserva DEBE poder pagarla (regla actual `canPay`), incluidos los admins que reservan
   como clientes (D5).
10. CADA pago DEBE generar un movimiento "Reserva" en rojo en la billetera del cliente.

## Requisito 3 — Cancelación y devolución

**Historia:** como cliente, quiero recuperar mis puntos si cancelo a tiempo, para no perderlos.

1. LAS reglas de quién puede cancelar y cuándo NO cambian: el cliente con 24 h o más de anticipación; los
   admins sin límite (ADMIN cualquiera, VENUE_ADMIN las de su complejo) (D1).
2. CUANDO se cancela una reserva **pagada con puntos**, sea quien sea quien cancela, EL sistema DEBE devolver
   al dueño el **100% de los puntos pagados** (el monto realmente cobrado, no el precio actual) (D1, D2).
3. LA devolución DEBE ser atómica con la cancelación y generar un movimiento "Devolución" en verde.
4. UNA reserva NO DEBE poder devolverse dos veces (cancelaciones repetidas o simultáneas).
5. CUANDO se cancela una reserva **pendiente** (no pagada), NO DEBE moverse ningún punto.
6. LA cancelación automática por falta de pago (cron, menos de 24 h) SOLO afecta reservas pendientes, por lo
   que NO DEBE devolver puntos.
7. COMO el complejo solo suma puntos cuando el turno se juega, una cancelación NUNCA DEBE generar movimientos
   en la billetera de la sede.

## Requisito 4 — Acreditación a la sede

**Historia:** como admin de sede, quiero ver lo que mi complejo ganó con los turnos jugados, para saber cuánto me van a pagar.

1. CUANDO un turno pagado pasa a "Completada" (cron de completar turnos), EL sistema DEBE acreditar a la sede
   el `base_price` de la reserva (sin la comisión) como movimiento en verde.
2. LA acreditación DEBE ocurrir **una sola vez** por reserva, aunque el cron corra dos veces.
3. LA comisión (`commission_amount`) DEBE quedar registrada como ganancia de la empresa en ese mismo momento.
4. EL movimiento DEBE guardar a qué **mes de liquidación** pertenece (día AR del fin del turno).

## Requisito 5 — Billetera de la sede (admin de sede)

**Historia:** como admin de sede, quiero ver el saldo y el historial de mi complejo.

1. EL panel DEBE tener la sección "Billetera" justo después de "Dashboard", visible para el admin de sede.
2. DEBE mostrar: saldo pendiente de cobro (acreditado − liquidado) y lo acreditado en el mes en curso.
3. DEBE mostrar una tabla con fecha y hora (AR), detalle y monto:
   - Verde "+": "Turno jugado — [cancha], [fecha y hora del turno], [cliente]" por el precio base.
   - Rojo "−": "Pago de la empresa — [mes]" por el monto liquidado, con acceso al comprobante.
4. LA tabla DEBE filtrarse por rango de fechas y por tipo, y paginarse en el servidor.
5. EL admin de sede SOLO DEBE ver la billetera de su complejo. NUNCA debe ver la comisión de la empresa.

## Requisito 6 — Gestión de puntos (admin general)

**Historia:** como admin general, quiero cargar y corregir puntos de los clientes, y ver todos los movimientos.

1. EL panel DEBE tener la sección "Puntos" justo después de "Dashboard", visible solo para el admin general.
2. DEBE listar los usuarios con buscador (nombre, email, DNI) mostrando: saldo actual y total histórico gastado.
3. DEBE permitir **sumar** o **restar** puntos a un usuario con: cantidad (entero, mayor que 0) y motivo
   **obligatorio** (ej. "Transferencia comprobante #123"), con confirmación antes de aplicar.
4. UNA resta que deje el saldo en negativo DEBE rechazarse (D7).
5. CADA ajuste DEBE registrar quién lo hizo, cuándo y el motivo; NUNCA puede editarse ni borrarse
   (para corregir, se hace otro ajuste).
6. DEBE haber un historial global con fecha y hora, detalle y monto:
   - Verde: "Carga de puntos a [cliente]" (recargas).
   - Rojo: "Ajuste a [cliente]" (restas) y "Pago a complejo [sede]" (liquidaciones).
   - Con filtros por fecha, tipo, cliente y complejo; paginado en el servidor.
7. SOLO el admin general DEBE poder hacer ajustes y ver el historial global (la base lo exige).

## Requisito 7 — Balances (admin general)

**Historia:** como admin general, quiero ver el dinero que entró y lo que les pagué a los complejos.

1. EL panel DEBE tener la sección "Balances" justo después de "Puntos", solo para el admin general.
2. DEBE mostrar, en pesos (1 punto = $1):
   - **Recaudado**: recargas − ajustes negativos (dinero real ingresado) (D7).
   - **En billeteras de clientes**: puntos cargados y todavía no usados.
   - **Comisión de la empresa**: comisión de los turnos jugados.
   - **Pagado a complejos** y **pendiente de pagar a complejos**.
3. DEBE mostrar por complejo y por mes: monto a liquidar, estado (Pendiente / Pagado), fecha de pago y comprobante.
4. LOS montos DEBEN cuadrar: Recaudado = En billeteras + (puntos gastados en turnos jugados) +
   (puntos gastados en turnos todavía no jugados). Si no cuadra, la base tiene un error y debe detectarse en las pruebas.

## Requisito 8 — Liquidación mensual

**Historia:** como admin general, quiero registrar el pago mensual a cada complejo con su comprobante.

1. EL admin general DEBE poder "Registrar pago a sede" para un complejo y un **mes ya terminado** (hora AR).
2. EL monto DEBE ser exactamente lo acreditado a esa sede en ese mes y todavía no liquidado; no se puede editar (D6).
3. DEBE exigir el comprobante: archivo (imagen o PDF, máx. 5 MB) y/o número de transferencia; al menos uno.
4. AL registrarlo, EL sistema DEBE crear el movimiento rojo en la billetera de la sede y dejar ese mes en cero.
5. UN mismo complejo y mes NO DEBE poder liquidarse dos veces. Un mes con monto 0 no se liquida.
6. LOS comprobantes DEBEN ser privados: solo el admin general y el admin de esa sede pueden verlos.
7. SI después de liquidar se completa tarde un turno de ese mes (ej. el cron no corrió), DEBE sumarse al mes
   en que se acreditó y no reabrir el mes ya pagado.

## Requisito 9 — Arranque en limpio (D8)

1. AL instalar la billetera, EL sistema DEBE borrar todas las reservas existentes, los turnos fijos, los
   cambios de precio pendientes y las notificaciones de reservas. Esta acción es **irreversible**.
2. NO DEBE borrar usuarios, complejos, canchas, horarios, tarifas, bloqueos ni publicidad.
3. TODAS las billeteras arrancan en 0 puntos.

## Requisito 10 — Integridad y seguridad

1. LOS saldos y movimientos DEBEN escribirse **solo** desde funciones del servidor; ningún usuario puede
   insertarlos ni modificarlos directamente por la API (mismo criterio que las reservas, migración 028).
2. TODA operación que mueva puntos DEBE ser atómica y resistente a concurrencia (dos pestañas, reintentos de red).
3. LOS montos DEBEN ser enteros de puntos (decisión D9):
   - La comisión se **redondea al peso** al calcular el precio (5% de 12.345 = 617,25 → 617).
   - Las tarifas base DEBEN ser pesos enteros (la base lo exige; las tarifas existentes con centavos se redondean).
4. TODOS los textos, errores y fechas de estas pantallas DEBEN estar en español y en hora de Argentina.
5. LAS notificaciones in-app y emails existentes DEBEN seguir funcionando (pago, cancelación, comisión), y los
   emails de pago y devolución DEBEN mencionar los puntos.

## Requisito 11 — Cómo cargar puntos (WhatsApp)

1. EL cliente DEBE tener un botón **"Cargar puntos por WhatsApp"** que abre un chat con **+54 9 2984 33-9319**
   (`https://wa.me/5492984339319`) con el mensaje ya escrito: "Hola, quiero comprar X puntos.".
2. EL botón DEBE estar en "Mi billetera" y en el aviso de saldo insuficiente.
3. EN el aviso de saldo insuficiente, X DEBE ser **lo que le falta** para esa reserva; en "Mi billetera", el
   cliente DEBE poder escribir cuántos puntos quiere antes de abrir WhatsApp (entero mayor que 0).
4. EL mensaje DEBE incluir el email del usuario para que el admin general identifique a quién cargarle:
   "Hola, quiero comprar X puntos. Mi cuenta: email@ejemplo.com".
5. EL número DEBE estar en un solo lugar del código (constante), para cambiarlo fácil.
6. LA recarga sigue siendo manual: el admin general recibe la transferencia y carga los puntos (Requisito 6).
