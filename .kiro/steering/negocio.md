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
- **Confirmación**: tasa de concreción = (Realizadas + Completadas) / activas, donde activas = total − canceladas. Las canceladas quedan fuera del cálculo.

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

## Cancelación

- El cliente solo puede cancelar con **24 horas o más de anticipación** al inicio del turno. Los administradores no tienen ese límite.
- Al crear una reserva (única o turno fijo) cuyo inicio está a menos de 24h, avisar con un modal que no se podrá cancelar.

## Flujo de trabajo

- Backend NestJS + Prisma/Postgres (Railway). Frontend Next.js + HeroUI (Vercel).
- Verificar build antes de commitear: backend `npx nest build`, frontend `npx next build`.
- Commit + push a `main` por cada cambio.
