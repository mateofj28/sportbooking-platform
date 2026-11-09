import { z } from "zod";

export const createBookingSchema = z.object({
    facilityId: z.string().uuid("Instalación requerida"),
    startDatetime: z.string().min(1, "Fecha y hora de inicio requerida"),
    endDatetime: z.string().min(1, "Fecha y hora de fin requerida"),
    notes: z.string().optional(),
});

export const CANCEL_REASON_MAX = 300;

export const cancelBookingSchema = z.object({
    reason: z
        .string()
        .trim()
        .max(CANCEL_REASON_MAX, `El motivo admite hasta ${CANCEL_REASON_MAX} caracteres`)
        .optional(),
});

/** Filtro por rango del panel: hasta 2 años hacia atrás (historial) y 2 hacia adelante. */
export const BOOKING_RANGE_YEARS = 2;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const fmtDay = (d: string) => d.split("-").reverse().join("/"); // "2026-11-09" -> "09/11/2026"

/**
 * Rango de fechas del panel de reservas (días "YYYY-MM-DD" en hora AR, ambos inclusive).
 * Mismos límites que el selector y que la RPC admin_list_bookings (migración 023):
 * el usuario puede escribir el año a mano, así que el selector no alcanza.
 * Las fechas ISO se comparan como texto: el orden lexicográfico coincide con el cronológico.
 */
export function bookingRangeSchema(minDay: string, maxDay: string) {
    const outOfBounds = `Elegí fechas entre el ${fmtDay(minDay)} y el ${fmtDay(maxDay)}`;
    return z
        .object({
            from: isoDay.refine((d) => d >= minDay && d <= maxDay, outOfBounds),
            to: isoDay.refine((d) => d >= minDay && d <= maxDay, outOfBounds),
        })
        .refine((r) => r.from <= r.to, { message: "La fecha de fin no puede ser anterior a la de inicio", path: ["to"] });
}

export type CreateBookingFormData = z.infer<typeof createBookingSchema>;
export type CancelBookingFormData = z.infer<typeof cancelBookingSchema>;
