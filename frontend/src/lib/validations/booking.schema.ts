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

export type CreateBookingFormData = z.infer<typeof createBookingSchema>;
export type CancelBookingFormData = z.infer<typeof cancelBookingSchema>;
