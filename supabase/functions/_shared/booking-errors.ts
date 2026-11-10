// ============================================================
// _shared/booking-errors.ts
// Traduce los errores de integridad que lanza la base al insertar una reserva
// (migración 025) a mensajes y códigos HTTP claros para el usuario.
//
// La base es la que garantiza (sin carreras): las validaciones previas de las
// Edge Functions solo sirven para responder rápido en el caso común.
// ============================================================

export interface BookingInsertProblem {
  message: string
  status: number
}

/** Error de PostgREST / Postgres tal como lo devuelve supabase-js. */
interface DbError {
  code?: string
  message?: string
}

/**
 * - 23P01 (exclusion_violation): otra reserva activa ya ocupa el turno.
 *   Pasa cuando dos personas confirman el mismo horario al mismo tiempo.
 * - 23514 (check_violation): el trigger validate_booking_slot rechazó el turno
 *   (fuera del horario de la cancha, bloqueado, fin <= inicio). Su mensaje ya está
 *   escrito para el usuario.
 */
export function bookingInsertProblem(e: DbError): BookingInsertProblem {
  if (e.code === '23P01') {
    return { message: 'El horario ya está reservado', status: 409 }
  }
  if (e.code === '23514' && e.message) {
    const blocked = e.message.includes('bloqueado')
    return { message: e.message, status: blocked ? 409 : 400 }
  }
  return { message: `Error al crear la reserva: ${e.message ?? 'desconocido'}`, status: 500 }
}
