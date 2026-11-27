# Requisitos — Entrenadores

## Introducción

SportBooking suma una segunda cosa para reservar, además de canchas: **clases con entrenadores**.
Un entrenador publica en qué deportes enseña, cuánto cobra y cuándo está disponible; los clientes reservan
y pagan con créditos. Ejemplo: Marcos enseña pádel los lunes y jueves de 18:00 a 21:00 y cobra $10.000 por hora.

Se apoya en lo que ya existe: la billetera de créditos (1 crédito = $1, único medio de pago), la comisión de la
empresa, los pagos a pedido (como los complejos), los turnos fijos, los crons de cancelación y recordatorio, la
hora de Argentina y el panel `/dashboard`.

### Decisiones tomadas con el dueño del negocio

| # | Tema | Decisión |
|---|---|---|
| E1 | Moneda | **ARS**, como toda la app. Se paga con **créditos**. |
| E2 | Pago | Se paga **al reservar** (clase única). Sin "reservar y pagar después". |
| E3 | Avisos | **Emails** al cliente (confirmación, cancelación, recordatorio ~2 h antes) y al entrenador; **avisos in-app** para el entrenador y el admin general. Requiere verificar el dominio de Resend antes de lanzar. |
| E4 | Precio | Clases: **tarifa por hora × horas**. Canchas siguen con precio por turno. Son reglas separadas. |
| E5 | Alta | **La hace el admin general**: crea la cuenta (nombre, email, teléfono, DNI, contraseña, foto opcional). Después el entrenador completa su perfil y lo **publica**. No hay registro abierto de entrenadores. |
| E6 | Datos | DNI y teléfono obligatorios. |
| E7 | Doble rol | **Un cliente puede ser entrenador y un entrenador puede ser cliente**: es un cambio de rol que habilita tareas específicas, con la misma cuenta. Se respeta lo que tiene cada uno: billetera, reservas como cliente, perfil, clases y saldo como entrenador. El cambio de rol nunca borra datos. Como entrenador, también reserva canchas y clases de otros entrenadores (reglas de cliente). |
| E8 | Confirmación | La reserva queda **confirmada al pagar**. El entrenador no la acepta. |
| E9 | Panel | Rol nuevo **`TRAINER`**, con su panel dentro de `/dashboard`. |
| E10 | Lugar | **Texto libre** por franja de disponibilidad (ej. "Club Social Roca, cancha 2"). La cancha la consigue el entrenador por fuera de la app. |
| E11 | Duración | Según el **deporte**: el admin general define las duraciones permitidas (horas enteras). |
| E12 | Anticipación | Se reserva con **24 h o más** de anticipación y hasta **30 días** adelante (hora AR). |
| E13 | Cupos | Según el **deporte**: el admin general define el máximo de alumnos por clase (1 = individual; > 1 = grupal). |
| E14 | Grupales | La primera reserva de un horario define la clase (inicio y duración). Los siguientes se suman hasta llenar el cupo. El entrenador tiene **tarifa individual** y **tarifa grupal por persona**. |
| E15 | Clases fijas | Sí, **semanales**, igual que los turnos fijos de canchas: al crearlas se elige **pagar todo / solo la próxima / solo crearlas**; las fechas sin pagar se cancelan solas a menos de 24 h. |
| E16 | Bloqueos | El entrenador no puede bloquear un día con clases reservadas: primero las cancela (100% de devolución). |
| E17 | Comisión | Como en canchas: el cliente paga **tarifa + comisión** (redondeada al peso) y el entrenador recibe su tarifa completa. El **% va en cada franja de horario**, lo carga el **admin general** y el entrenador lo ve **sin poder cambiarlo** (confirmado). La base lo garantiza, como en canchas desde la migración 063. |
| E18 | Pago al entrenador | Igual que los complejos: saldo de clases **ya terminadas**; el entrenador **solicita** el pago cuando quiere; el admin general lo paga o lo rechaza con motivo. |
| E19 | Cancela el cliente | Con **24 h o más** de anticipación. Devolución del **100%** en créditos. |
| E20 | Cancela el entrenador | En cualquier momento. Devolución del **100%** al cliente, aviso por email; el admin general ve cuántas cancela cada entrenador. |
| E21 | Menú | "Entrenamientos" (reservado en "Más") pasa a llamarse **"Entrenadores"**. |
| E22 | Visibilidad del admin general | **Ve todo** lo del entrenador (ver Requisito 11). El **admin de sede no ve nada** de entrenadores. |
| E23 | Cambios del entrenador | Una reserva **ya pagada** conserva precio, lugar y horario. Las fechas **sin pagar de una clase fija** (que todavía no se usaron) **sí se actualizan**: tarifa, lugar y horario pasan a los nuevos, y al pagar el cliente paga **lo vigente**. El cliente recibe un aviso con el cambio (como el reprecio de turnos fijos de canchas, migraciones 029/030). |

**Fuera de alcance (v1):** calificaciones y reseñas, chat entrenador–cliente, "Escuela de fútbol", notificaciones
in-app para clientes, clases a domicilio con dirección del cliente, reserva conjunta de cancha + entrenador.

## Glosario

- **Entrenador**: usuario con rol `TRAINER`. Estados de su perfil: **borrador**, **publicado**, **suspendido**.
- **Franja de disponibilidad**: día de la semana + hora de inicio y fin (hora AR) + lugar (texto) + tarifa.
- **Bloqueo**: fecha (o rango) en que el entrenador no da clases.
- **Clase**: un horario concreto del entrenador (inicio, fin, deporte, lugar) con 1 o más alumnos.
- **Reserva de clase**: el lugar de **un** cliente en una clase. Una clase grupal tiene varias reservas.
- **Clase fija**: serie semanal de reservas de clase de un cliente (como un turno fijo).
- **Cupo**: máximo de alumnos por clase, definido por deporte.
- **Saldo del entrenador**: tarifas de clases ya terminadas menos los pagos recibidos.

---

## Requisito 1 — Configuración de deportes para clases (admin general)

**Historia:** como admin general, quiero definir cómo son las clases de cada deporte, para que todos los
entrenadores sigan las mismas reglas.

1. EN la pantalla **Deportes**, el admin general DEBE poder configurar, por deporte:
   - si **admite clases** (sí/no);
   - las **duraciones permitidas** en horas enteras (ej. pádel: 1 y 2 h; fútbol: 1 h);
   - el **cupo máximo** de alumnos por clase (1 = individual).
2. UN entrenador SOLO DEBE poder enseñar deportes que admiten clases.
3. CAMBIAR la configuración NO DEBE alterar clases ya reservadas.

## Requisito 2 — Alta y suspensión de entrenadores (admin general)

**Historia:** como admin general, quiero dar de alta y controlar a los entrenadores, para que solo enseñen
personas que conozco.

1. EL admin general DEBE poder crear un entrenador con: nombre, apellido, email, teléfono, DNI, contraseña y foto
   (opcional). Valida igual que los usuarios de hoy (`PhoneInput`, `DniInput`, email único, DNI único).
2. EL entrenador recién creado DEBE quedar en estado **borrador** (no visible para clientes).
3. EL admin general DEBE poder **suspender** y **reactivar** a un entrenador. Suspendido: no aparece a los
   clientes y no se pueden hacer reservas nuevas; las ya hechas siguen vigentes salvo que el admin las cancele.
4. NO DEBE existir autoregistro como entrenador desde la pantalla pública de registro.
5. EL admin general DEBE poder cambiar el rol de un usuario **de cliente a entrenador y de entrenador a cliente**
   desde Usuarios (E7). El cambio **no borra nada**:
   - de cliente a entrenador: conserva billetera, movimientos y reservas como cliente; el perfil de entrenador
     arranca en borrador;
   - de entrenador a cliente: conserva billetera, reservas como cliente, perfil, historial de clases y saldo
     ganado (el admin se lo sigue pudiendo pagar); su perfil deja de mostrarse a los clientes.
   - SI el entrenador tiene clases **futuras**, EL sistema DEBE impedir pasarlo a cliente hasta que esas clases
     se cancelen (100% de devolución a los alumnos) o terminen. **A confirmar.**
   - SI vuelve a ser entrenador, recupera su perfil, franjas y saldo tal como estaban.

## Requisito 3 — Perfil del entrenador

**Historia:** como entrenador, quiero completar mi perfil, para que los clientes sepan qué enseño.

1. EL entrenador DEBE poder cargar: deportes que enseña (de la lista, uno o más), descripción corta y
   experiencia (opcionales, con límite de caracteres), foto.
2. EL entrenador DEBE poder **publicar** su perfil solo si tiene: al menos un deporte, tarifa individual (y grupal
   si alguno de sus deportes es grupal) y al menos una franja de disponibilidad.
3. EL entrenador DEBE poder **despublicar** (volver a borrador). Las reservas ya hechas siguen vigentes.
4. NOMBRE, apellido y DNI NO DEBEN poder cambiarse desde el perfil (mismo criterio que los clientes, migración 039).

## Requisito 4 — Tarifas y disponibilidad

**Historia:** como entrenador, quiero definir cuándo trabajo y cuánto cobro, para que me reserven solo en esos horarios.

1. EL entrenador DEBE poder crear **franjas** semanales: día, hora de inicio y fin (hora AR), lugar (texto libre,
   obligatorio) y deporte(s) que da en esa franja.
2. CADA franja DEBE tener **tarifa individual por hora** y, si el deporte es grupal, **tarifa grupal por persona
   por hora** (pesos enteros, > 0).
3. CADA franja DEBE tener un **% de comisión** (1 a 100, con decimales, igual que canchas) que **solo carga el
   admin general**; el entrenador lo ve en solo lectura y ve el precio final que paga el cliente (E17).
4. LAS franjas de un mismo día NO DEBEN superponerse.
5. UNA franja PUEDE cruzar la medianoche (ej. 22:00–01:00), con la misma regla de ventana de 48 h que las canchas.
6. AL modificar o borrar una franja (tarifa, lugar u horario) (E23):
   - las reservas **pagadas** NO DEBEN cambiar: conservan precio, lugar y horario;
   - las fechas **sin pagar** de una clase fija que todavía no empezaron DEBEN actualizarse a la tarifa, el lugar y
     el horario nuevos, y al pagar se cobra **lo vigente** (rechazando si el cliente confirmó con otro precio, como
     `expected_total`);
   - el cliente DEBE recibir un email con lo que cambió (agrupado, como `cron-notify-price-changes`);
   - SI con el cambio una fecha sin pagar ya no entra en ninguna franja (o se pisa con otra clase o con un
     bloqueo), DEBE **cancelarse sola** con aviso al cliente. **A confirmar, ver Requisito 8.7.**
7. EL entrenador DEBE poder **bloquear** fechas sueltas o rangos (vacaciones, imprevistos), con motivo opcional.
8. SI la fecha a bloquear tiene clases reservadas, EL sistema DEBE impedir el bloqueo e indicar cuáles son (E16).

## Requisito 5 — Sección "Entrenadores" para el cliente

**Historia:** como cliente, quiero encontrar un entrenador que me sirva, para reservar una clase.

1. LA vista de cliente DEBE tener la sección **Entrenadores** ("Más" en celular, menú del avatar en computadora)
   (E21). Lista solo entrenadores **publicados** y no suspendidos.
2. EL cliente DEBE poder filtrar por **deporte**, **día de la semana** y **precio** (rango por hora).
3. CADA entrenador DEBE mostrar: foto, nombre, deportes, desde qué precio por hora (precio final, con comisión),
   días en que da clases.
4. EL perfil del entrenador DEBE mostrar: descripción, experiencia, deportes, tarifas finales (individual y
   grupal), lugares y horarios **libres** de los próximos 30 días.
5. LA búsqueda y los filtros DEBEN resolverse en la base y paginarse (no traer todos los entrenadores).

## Requisito 6 — Disponibilidad de horarios

**Historia:** como cliente, quiero ver solo horarios que realmente puedo reservar.

1. PARA un día, EL sistema DEBE ofrecer horarios de inicio dentro de las franjas del entrenador, en pasos de
   1 hora, para la duración elegida (de las permitidas por el deporte, E11).
2. UN horario NO DEBE ofrecerse si: empieza a menos de 24 h o a más de 30 días (E12); cae en un bloqueo; se pisa
   con otra clase del entrenador de distinto deporte o distinta duración; o la clase de ese horario ya está llena.
3. EN deportes grupales, SI ya hay una clase en ese horario con cupo, EL horario DEBE mostrarse con "**X lugares
   libres**" y la duración fija de esa clase (E14).
4. EL cálculo DEBE hacerse en la base (una función), igual que la disponibilidad de canchas, sin N+1.

## Requisito 7 — Reserva y pago de una clase

**Historia:** como cliente, quiero reservar y pagar una clase en un paso.

1. AL confirmar, EL sistema DEBE mostrar: entrenador, deporte, lugar, fecha y hora (AR), duración, si es
   individual o grupal, y el total: **tarifa × horas + comisión** (E4, E17), junto con el saldo de créditos.
2. EL pago con créditos y la reserva DEBEN ser **atómicos**: si el horario se ocupó o el cupo se llenó mientras
   tanto, no se cobra nada y se avisa.
3. DOS clientes NO DEBEN poder quedarse con el último lugar (ni con un horario individual) al mismo tiempo: la base
   lo garantiza (bloqueo de la fila / restricción de exclusión), no la pantalla.
4. EL entrenador NO DEBE tener dos clases superpuestas (la base lo garantiza).
5. UN cliente NO DEBE poder reservar dos veces la misma clase.
6. SIN saldo suficiente, EL sistema DEBE rechazar la reserva y mostrar cuánto falta y cómo cargar (como hoy).
7. EL entrenador NO DEBE poder reservar su propia clase.
8. LA reserva DEBE quedar **confirmada** al pagar (E8) y aparecer en "Mis reservas" del cliente (pestaña o filtro
   **Clases**), con su propio detalle.

## Requisito 8 — Clases fijas semanales

**Historia:** como cliente, quiero reservar la misma clase todas las semanas.

1. EL cliente DEBE poder crear una clase fija: mismo día, hora, duración y entrenador, con las próximas **8**
   ocurrencias (igual que turnos fijos).
2. AL crearla, EL cliente DEBE elegir **pagar todo**, **pagar solo la próxima** o **solo crearla** (E15). El cobro
   es todo o nada con la creación (como `pay_mode` ALL/NEXT/NONE, migración 054).
3. LAS fechas en conflicto (bloqueo, sin cupo, fuera de franja) DEBEN saltearse e informarse; si fallan todas, no
   se crea nada.
4. LAS fechas sin pagar DEBEN cancelarse solas a menos de 24 h (mismo cron que canchas, `cron-cancel-unpaid`), y
   NO DEBEN ofrecerse para pagar una vez empezada la clase (`isPayable`).
5. EL cliente DEBE poder cancelar la serie (fechas a 24 h o más; 100% de lo pagado) y pagar fechas pendientes
   ("Pagar" / "Pagar todo").
6. LAS fechas sin pagar DEBEN **ocupar** el lugar (horario o cupo) hasta pagarse o cancelarse.
7. SI el entrenador cambia el **horario** de una franja, las fechas sin pagar de clases fijas en esa franja DEBEN
   moverse **manteniendo su posición dentro de la franja** (ej. franja 18–21 pasa a 19–22: la clase de 18 a 19
   pasa a 19 a 20). SI la nueva posición no entra, se pisa con otra clase o con un bloqueo, o quedaría a menos de
   24 h, la fecha DEBE cancelarse sola con aviso. **A confirmar.**

## Requisito 9 — Cancelaciones

1. EL cliente DEBE poder cancelar con **24 h o más** de anticipación al inicio (instante absoluto) (E19).
2. EL entrenador DEBE poder cancelar una reserva o una clase entera **en cualquier momento**, con motivo
   obligatorio (E20).
3. EL admin general DEBE poder cancelar cualquier clase o reserva, con motivo.
4. TODA cancelación DEBE devolver el **100%** de lo pagado a la billetera del cliente, en la misma operación.
5. CANCELAR una reserva de una clase grupal DEBE liberar ese lugar.
6. LA cancelación DEBE registrar quién canceló (cliente / entrenador / admin) y el motivo.
7. NO DEBE poder cancelarse una clase ya terminada.

## Requisito 10 — Panel del entrenador

**Historia:** como entrenador, quiero gestionar mis clases y mi plata en un solo lugar.

1. EL entrenador DEBE entrar a `/dashboard` y ver **solo su menú**: Inicio, Mis clases, Disponibilidad, Bloqueos,
   Perfil, Billetera, Notificaciones (E9). NO DEBE ver nada de complejos, canchas ni otros entrenadores.
2. **Mis clases**: próximas e historial, con alumnos por clase, estado de pago, filtros por fecha y estado,
   paginado en la base. Puede cancelar (Req. 9.2).
3. **Billetera**: saldo sin cobrar, solicitado, disponible, movimientos y solicitudes de pago (igual que la
   billetera de sede). Ve su tarifa ganada, **no** la comisión de la empresa.
4. EL entrenador DEBE poder **solicitar su pago** (todo lo disponible u otro monto > 0, una solicitud pendiente a
   la vez) (E18).
5. LAS ganancias DEBEN reconocerse cuando la clase **terminó** (día de fin, hora AR), como las canchas.
6. EL entrenador DEBE poder usar la app como cliente (E7) con el cambio "Vista de cliente" / "Panel".

## Requisito 11 — Lo que ve y hace el admin general

**Historia:** como admin general, quiero tener control total de los entrenadores.

1. **Entrenadores** (pantalla nueva del panel): lista con estado (borrador / publicado / suspendido), deportes,
   tarifas, cantidad de clases, cancelaciones (separadas: por el entrenador / por clientes); búsqueda y filtros;
   paginado en la base. Desde ahí: ver perfil, disponibilidad y bloqueos; editar el % de comisión de cada franja;
   suspender / reactivar; dar de alta.
2. **Clases**: todas las clases y reservas de clase, filtrables por entrenador, deporte, fecha y estado; puede
   cancelar con motivo.
3. **Dinero**: en Balances y Créditos, los entrenadores se suman a los complejos: saldo por entrenador, solicitudes
   de pago, pagos realizados, comisión de clases. Las tarjetas de Balances deben seguir cuadrando.
4. **Estadísticas**: clases y reservas por período, ingresos de entrenadores, comisión de clases, por deporte y
   por entrenador (mismas reglas AR: actividad por día de inicio, dinero por día de fin).
5. **Notificaciones** del admin general: entrenador publicado, clase reservada, clase cancelada (indicando quién),
   pago solicitado por un entrenador.
6. EL **admin de sede NO DEBE ver** entrenadores, clases ni su dinero en ninguna pantalla ni por la API (E22).

## Requisito 12 — Avisos

1. AL cliente, por **email**: reserva confirmada (con lugar), clase fija creada (con fechas pendientes de pago si
   las hay), cancelación (indicando quién y el motivo), recordatorio ~2 h antes (idempotente, como canchas).
2. AL entrenador: **in-app** y por **email** cuando le reservan, cuando un cliente cancela y recordatorio de su
   próxima clase.
3. AL admin general: los avisos in-app del Requisito 11.5.
4. LOS emails son best-effort: nunca bloquean la reserva ni la cancelación. Fechas y horas en hora AR.

## Requisito 13 — Seguridad e integridad

1. LAS reglas de negocio (anticipación, cupo, superposición, precio, comisión, cancelación) DEBEN validarse en la
   base o en Edge Functions, nunca solo en la pantalla.
2. RLS por rol: el entrenador ve y edita solo lo suyo; el cliente ve sus reservas de clase y los perfiles
   publicados; el admin general ve todo; el admin de sede no ve nada de entrenadores.
3. EL % de comisión NO DEBE poder modificarlo el entrenador por la API (E17).
4. EL dinero de clases DEBE moverse con los mismos mecanismos inmutables de la billetera (movimientos que no se
   borran ni editan), y los totales de Balances deben seguir cuadrando (migración 057).
5. TODO texto visible va en español (Argentina), con los formatos de fecha y moneda de la app.
