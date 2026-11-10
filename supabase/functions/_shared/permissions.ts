// ============================================================
// _shared/permissions.ts
// Reglas de quién puede operar sobre una reserva / turno fijo.
//
// Regla de negocio: un ADMIN o VENUE_ADMIN también puede actuar como cliente
// (ver canchas, reservar, ver y cancelar SUS reservas), en cualquier complejo.
// Por eso hay que distinguir dos situaciones sobre un mismo recurso:
//
//   1. Es MÍO (el recurso pertenece a quien llama): se rige por las reglas de
//      CLIENTE (ej. cancelar solo con 24 h de anticipación), sea cual sea su rol
//      y en el complejo que sea.
//   2. Es de OTRA persona: se rige por el rol de administración
//      (ADMIN: todo; VENUE_ADMIN: solo su complejo; CLIENT: nada).
//
// Es una función pura (sin red ni base) para poder probarla con casos concretos.
// ============================================================

export type Role = 'CLIENT' | 'ADMIN' | 'VENUE_ADMIN'

export interface Actor {
  id: string
  role: Role
  /** Complejo que administra (solo VENUE_ADMIN). */
  venueId: string | null
}

/** Arma el Actor desde el usuario autenticado de Supabase. */
export function actorFromUser(user: {
  id: string
  app_metadata?: Record<string, unknown>
}): Actor {
  const raw = user.app_metadata?.role
  const role: Role = raw === 'ADMIN' || raw === 'VENUE_ADMIN' ? raw : 'CLIENT'
  const venueId = user.app_metadata?.venue_id
  return { id: user.id, role, venueId: typeof venueId === 'string' ? venueId : null }
}

/**
 * ¿Puede el actor operar sobre un recurso (reserva, turno fijo) de este dueño
 * y de este complejo?
 */
export function canManage(actor: Actor, ownerId: string, resourceVenueId: string | null): boolean {
  if (ownerId === actor.id) return true // lo propio: siempre, en cualquier complejo
  if (actor.role === 'ADMIN') return true
  if (actor.role === 'VENUE_ADMIN') {
    return actor.venueId !== null && actor.venueId === resourceVenueId
  }
  return false
}

/**
 * ¿Se le aplican las reglas de CLIENTE sobre este recurso?
 * Sí si es un CLIENT, o si es una reserva propia de un administrador.
 * (Ej.: la cancelación con 24 h de anticipación.)
 */
export function appliesClientRules(actor: Actor, ownerId: string): boolean {
  return actor.role === 'CLIENT' || ownerId === actor.id
}

/**
 * ¿Puede el actor PAGAR esta reserva?
 * Solo el titular, desde su vista de cliente. Ningún administrador (ni el general
 * ni el de sede) puede marcar como pagada la reserva de otra persona.
 * Un admin sí puede pagar SUS propias reservas, porque ahí actúa como cliente.
 */
export function canPay(actor: Actor, ownerId: string): boolean {
  return ownerId === actor.id
}
