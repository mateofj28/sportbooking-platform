/**
 * Espejo en el frontend de `supabase/functions/_shared/permissions.ts`.
 *
 * Solo decide QUÉ MOSTRAR (botones, avisos). La autorización real la hace la
 * Edge Function: si estas reglas cambian allá, actualizarlas también acá.
 *
 * - Lo MÍO (reserva propia, aunque sea admin): reglas de cliente
 *   -> cancelar solo con 24 h o más de anticipación.
 * - Lo AJENO: según el rol (ADMIN: todo; VENUE_ADMIN: su complejo; CLIENT: nada).
 */
import type { AppRole } from "@/stores/auth-store";

export const CLIENT_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Actor {
    id: string;
    role: AppRole;
    venueId: string | null;
}

export function canManage(actor: Actor, ownerId: string, resourceVenueId: string | null): boolean {
    if (ownerId === actor.id) return true;
    if (actor.role === "ADMIN") return true;
    if (actor.role === "VENUE_ADMIN") return actor.venueId !== null && actor.venueId === resourceVenueId;
    return false;
}

export function appliesClientRules(actor: Actor, ownerId: string): boolean {
    return actor.role === "CLIENT" || ownerId === actor.id;
}

export type CancelCheck = { allowed: true } | { allowed: false; reason: string };

/** ¿Puede este actor cancelar esta reserva ahora? Con el motivo si no puede. */
export function checkCancel(
    actor: Actor,
    booking: { userId: string; status: string; startDatetime: string; facility?: { venue?: { id: string } | null } | null },
    now: number = Date.now(),
): CancelCheck {
    if (booking.status !== "CONFIRMED") return { allowed: false, reason: "La reserva no está activa" };
    const msToStart = new Date(booking.startDatetime).getTime() - now;
    if (msToStart <= 0) return { allowed: false, reason: "El turno ya empezó" };
    if (!canManage(actor, booking.userId, booking.facility?.venue?.id ?? null)) {
        return { allowed: false, reason: "No tenés permiso sobre esta reserva" };
    }
    if (appliesClientRules(actor, booking.userId) && msToStart < CLIENT_CANCEL_WINDOW_MS) {
        return { allowed: false, reason: "Es tu reserva: solo se cancela con 24 h de anticipación" };
    }
    return { allowed: true };
}
