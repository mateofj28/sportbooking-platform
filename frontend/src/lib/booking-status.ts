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
    // Pagada: distinguir turno fijo (ya pagado) de reserva única (lista para usar)
    if (booking.recurringBookingId) {
        return { label: "Pagada", color: "success" };
    }
    return { label: "Lista para usar", color: "success" };
}
