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
- "¿El turno ya terminó?" se evalúa comparando instantes absolutos (`endDatetime <= now`); esto es correcto sin importar la zona.
- Los rangos de período (hoy/ayer/semana/mes/personalizado) se cortan a **medianoche hora Argentina**.

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
- **El pago lo hace solo el titular de la reserva**, desde su vista de cliente. Ni el ADMIN general ni el VENUE_ADMIN
  pagan ni marcan como pagada la reserva de otra persona: el panel de administración NO ofrece "Marcar como pagada".
  Un admin sí paga sus propias reservas (ahí actúa como cliente).
- Regla técnica: la autorización de reservas vive en `supabase/functions/_shared/permissions.ts`
  (`canManage`, `appliesClientRules`, `canPay`). "Lo mío" siempre se puede; "lo ajeno" depende del rol,
  salvo el pago (`canPay`): solo el titular.
