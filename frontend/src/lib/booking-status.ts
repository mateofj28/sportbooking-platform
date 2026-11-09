import type { Booking } from "@/types";

export type ChipColor = "success" | "warning" | "danger" | "default";

/**
 * Devuelve la etiqueta y color del chip de estado que ve el cliente.
 * - Cancelada -> rojo
 * - Pago pendiente (turno fijo sin pagar) -> amarillo "Pendiente de pago"
 * - Pagada (turno fijo ya pagado) -> verde "Pagada"
 * - Reserva única (pagada al crear) -> verde "Lista para usar"
 */
export function getBookingStatusChip(booking: Pick<Booking, "status" | "paymentStatus" | "recurringBookingId">): { label: string; color: ChipColor } {
    if (booking.status === "CANCELLED") {
        return { label: "Cancelada", color: "danger" };
    }
    if (booking.status === "COMPLETED") {
        return { label: "Completada", color: "default" };
    }
    if (booking.paymentStatus === "PENDING") {
        return { label: "Pendiente de pago", color: "warning" };
    }
    // Pagada (tanto reservas únicas como turnos fijos ya pagados)
    return { label: "Pagada", color: "success" };
}

// ============================================================
// Estado de NEGOCIO para el panel de administración.
// Regla: de cara al admin existen Realizada / Completada / Cancelada.
//   - Realizada: pagada y el turno todavía no terminó.
//   - Completada: COMPLETED, o pagada cuyo fin ya pasó (aunque el cron aún no corrió).
//   - Cancelada.
// Caso aparte: turno fijo creado pero sin pagar -> "Pendiente de pago"
// (todavía no es una reserva realizada; el cron la cancela si no se paga).
// ============================================================

export type AdminBookingState = "REALIZADA" | "PENDIENTE_PAGO" | "COMPLETADA" | "CANCELADA";

export const ADMIN_BOOKING_STATES: Record<AdminBookingState, { label: string; plural: string; color: ChipColor }> = {
    REALIZADA: { label: "Realizada", plural: "Realizadas", color: "success" },
    PENDIENTE_PAGO: { label: "Pendiente de pago", plural: "Pendientes de pago", color: "warning" },
    COMPLETADA: { label: "Completada", plural: "Completadas", color: "default" },
    CANCELADA: { label: "Cancelada", plural: "Canceladas", color: "danger" },
};

export function getAdminBookingState(
    booking: Pick<Booking, "status" | "paymentStatus" | "endDatetime">,
    now: number = Date.now(),
): AdminBookingState {
    if (booking.status === "CANCELLED") return "CANCELADA";
    if (booking.status === "COMPLETED") return "COMPLETADA";
    if (booking.paymentStatus !== "PAID") return "PENDIENTE_PAGO";
    // "¿Ya terminó?" se compara en instantes absolutos: no depende de la zona
    return new Date(booking.endDatetime).getTime() <= now ? "COMPLETADA" : "REALIZADA";
}
