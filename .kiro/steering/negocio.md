# Reglas de negocio — SportBooking

Plataforma de reserva de canchas deportivas. Negocio en Argentina (zona UTC-3, moneda ARS, todo en español).

## Estados de una reserva (modelo de negocio)

De cara al usuario/admin existen **3 estados**:

- **Realizada**: el usuario creó y pagó la reserva, pero todavía NO usó el turno (turno futuro, aún no finalizó).
- **Completada**: el usuario ya usó el turno que compró (el turno ya finalizó).
- **Cancelada**: el usuario canceló un turno que había pagado.

Relación clave:
`Reservas (total) = Realizadas + Completadas + Canceladas`

> Nota de implementación: en la base, "Realizada" es una reserva `CONFIRMED` + `paymentStatus = PAID` cuyo turno no pasó; "Completada" es `COMPLETED` (o pagada cuyo fin ya pasó). No exponer los estados internos de Prisma al usuario; usar siempre los 3 nombres de negocio.

## Tarjetas de resumen / estadísticas

- **Reservas**: total de reservas hechas por los usuarios = Realizadas + Completadas + Canceladas (INCLUYE canceladas).
  - Subtexto: "X canceladas".
- **Realizadas**: pagadas cuyo turno aún no pasó.
- **Completadas**: turnos ya usados (finalizados).
- **Ingresos**: ver abajo.
- **Confirmación**: de TODAS las reservas, qué proporción NO se canceló = (Realizadas + Completadas) / Total, donde Total = Realizadas + Completadas + Canceladas. Si no hay canceladas → 100%. Subtexto: "X canceladas".

## Dinero / ganancias

- La **ganancia del complejo** es el **precio base** (`basePrice`), SIN la comisión de la empresa. Nunca usar `totalPrice` para ingresos del complejo.
- La **comisión de la empresa** (`commissionAmount`) se muestra aparte y solo al admin general.
- El ingreso/comisión se **reconoce cuando el turno YA finalizó** (turno pagado + `endDatetime` ya pasó), no al momento de pagar.
- La tarifa es **precio por turno fijo** (no por hora, no se multiplica por duración).

## Zona horaria (Argentina, UTC-3)

- El día al que pertenece una reserva se determina en **hora de Argentina** (restar 3h al instante UTC antes de sacar la fecha).
- **Actividad/conteos** (reservas, realizadas, canceladas, ocupación) se agrupan por el **día de INICIO** del turno (en hora AR).
- **Dinero** (ingresos, comisión, completadas a efectos de reconocimiento) se reconoce por el **día de FIN** del turno (en hora AR). Un turno que empieza 23:00 y termina 00:30 cuenta su ingreso al día siguiente.
  - El día de fin se toma del **último instante jugado** (`endDatetime - 1µs`): un turno 23:00 → 00:00 termina ese
    mismo día y cuenta su ingreso ese día, no el siguiente (migración 036).
- "¿El turno ya terminó?" se evalúa comparando instantes absolutos (`endDatetime <= now`); esto es correcto sin importar la zona.
- Los rangos de período (hoy/ayer/semana/mes/personalizado) se cortan a **medianoche hora Argentina**.
  - "Semana" = hoy + los 6 días anteriores; "Mes" = hoy + los 29 días anteriores (días AR completos, no `now - 7/30 días`).
- Los gráficos por día del frontend usan días AR (`todayAr()`), nunca la zona del navegador.
- Admin de sede: en estadísticas todo el dinero es **precio base**; la comisión vale 0 (migración 037).

## Cambio de tarifa y turnos fijos

- Cada reserva guarda su precio al crearse. Cambiar una tarifa NO cambia reservas pagadas, pasadas, canceladas
  ni reservas únicas.
- Excepción: las fechas de **turno fijo** `CONFIRMED` + impagas + con inicio a **más de 48 h** se recalculan con la
  tarifa vigente (sube o baja). 48 h porque el cron cancela impagas a < 24 h y el cliente cancela con ≥ 24 h:
  así siempre tiene al menos un día para pagar o cancelar.
- Si una fecha queda sin tarifa que la cubra, conserva su precio.
- Se avisa al cliente por email (`cron-notify-price-changes`, agrupa cambios seguidos: un solo aviso tras 5 min sin
  cambios; si vuelve al precio original, no avisa) y en la app ("antes / ahora", tabla `booking_price_changes`).
- Al pagar, nunca se cobra un monto distinto del que el cliente ve: `mark-paid` recibe `expected_total` y responde
  409 si el precio cambió.
- Implementación: `reprice_pending_recurring` + trigger `pricing_changed_reprice` (migraciones 029 y 030).

## Publicidad

- Se muestra **"Todo el país"** o en **municipios específicos**. No se segmenta por provincia.
- Unidad local = municipio de Georef (incluye partidos de Buenos Aires y comunas de CABA). En Santiago del Estero y
  Santa Cruz, que no tienen municipios en Georef, se usan sus departamentos. Catálogo: `ar_localities` (2.116,
  códigos `mun-<id>` / `dep-<id>`), generado por `frontend/scripts/build-ar-localities.mjs`.
- Se elige según el municipio en el que el cliente **está ahora**, por GPS (no el perfil). Las coordenadas se
  convierten a municipio en el dispositivo y no se envían.
- Sin ubicación precisa (sin permiso de GPS, zona rural fuera de todo municipio o fuera de Argentina) el cliente ve
  solo las nacionales. La IP no se usa: solo da la provincia.
- Hasta 500 municipios por publicidad (Córdoba tiene 427).

## Cancelación

- El cliente solo puede cancelar con **24 horas o más de anticipación** al inicio del turno. Los administradores no tienen ese límite.
- Al crear una reserva (única o turno fijo) cuyo inicio está a menos de 24h, avisar con un modal que no se podrá cancelar.

## Flujo de trabajo

- Backend NestJS + Prisma/Postgres (Railway). Frontend Next.js + HeroUI (Vercel).
- Verificar build antes de commitear: backend `npx nest build`, frontend `npx next build`.
- Commit + push a `main` por cada cambio.

## Administradores que reservan como clientes

- Un **ADMIN general** o un **VENUE_ADMIN** también puede usar la app como cliente: ver canchas, reservar, pagar y
  ver sus propias reservas. El admin de sede puede reservar en **cualquier complejo**, incluidos los de otros.
- La app tiene dos contextos, definidos por la ruta: `/dashboard/*` es la gestión del negocio; todo lo demás es la
  vista de cliente. El navbar ofrece el cambio entre ambos ("Panel de administración" / "Vista de cliente").
- "Mis Reservas" y "Turnos fijos" muestran **solo las reservas del propio usuario** (filtro explícito por `user_id`),
  nunca el alcance de administración. El panel de administración sigue viendo todo su alcance.
- Una reserva propia de un administrador se rige por las **reglas de cliente**: se puede cancelar solo con 24 horas
  o más de anticipación. Cancelar la reserva de otra persona no tiene ese límite (ADMIN: cualquiera; VENUE_ADMIN:
  las de su complejo).
- Precio y comisión son los **normales**; no hay trato especial para el admin ni para su propio complejo.
- **Datos del cliente:** el VENUE_ADMIN ve el **nombre y el email** del cliente (el email le sirve para ubicarlo
  en "Reserva Manual"); **DNI y teléfono son solo del ADMIN general**, y el admin de sede no puede buscar por esos
  datos. Se aplica en la base, no solo en pantalla: `admin_list_bookings` (031/032), la vista `profile_directory`
  (032: nombre y email de otras personas; el admin de sede ya no lee `profiles` directo, 033) y
  `admin_lookup_client` (búsqueda exacta: email para ambos admins, DNI solo el general).
- **Reserva manual:** un admin puede crear una reserva a nombre de un cliente (ADMIN en cualquier complejo,
  VENUE_ADMIN solo en el suyo). Queda **pendiente de pago** y la paga el cliente desde su cuenta.
- **Cancelación automática por falta de pago** (`cron-cancel-unpaid`, cada hora): toda reserva sin pagar (fecha de
  turno fijo o reserva manual) se cancela cuando faltan menos de 24 h para el turno, **solo si existía desde antes
  de ese límite** (el cliente tuvo tiempo de pagar). Una reserva creada a menos de 24 h del turno no se cancela sola.
  Nunca se cancela una reserva que se pagó a último momento (el UPDATE vuelve a exigir que siga impaga).
- **El pago lo hace solo el titular de la reserva**, desde su vista de cliente. Ni el ADMIN general ni el VENUE_ADMIN
  pagan ni marcan como pagada la reserva de otra persona: el panel de administración NO ofrece "Marcar como pagada".
  Un admin sí paga sus propias reservas (ahí actúa como cliente).
- Regla técnica: la autorización de reservas vive en `supabase/functions/_shared/permissions.ts`
  (`canManage`, `appliesClientRules`, `canPay`). "Lo mío" siempre se puede; "lo ajeno" depende del rol,
  salvo el pago (`canPay`): solo el titular.

## Perfil del usuario

- En "Mi Perfil" el usuario (cliente o admin de sede) edita su **teléfono** (con `PhoneInput`: país + validación)
  y su **email**. **Nombre y apellido** se muestran como texto (fijos; los corrige el admin general).
- El email se cambia por Supabase Auth (`auth.updateUser`), que manda un link de confirmación; al confirmarlo, el
  trigger `on_auth_user_email_changed` (migración 040) lo copia a `profiles.email`. Nunca escribir `profiles.email` directo.
- La base lo garantiza (`guard_profile_update`, migraciones 039/040): por la API, quien no es ADMIN general solo puede
  cambiar teléfono, foto y provincia de su propio perfil. Nunca su rol, sede, estado, DNI ni nombre.
- Formato de teléfono guardado: `+<código> <número>` (8 a 11 dígitos en el número).

## Ubicación de los complejos

- Cada complejo pertenece a un **municipio** del catálogo oficial (`ar_localities`, el mismo de la publicidad y de
  "¿Dónde querés jugar?"). Se guarda en `venues.locality_code`; la base completa `city` (nombre del municipio) y
  `state` (provincia) con el trigger `venue_fill_municipality` (migración 041).
- En la interfaz la palabra es siempre **"Municipio"**, nunca "Ciudad" ni "Localidad". Formularios: `MunicipalityFields`.
