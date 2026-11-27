// ============================================================
// Validaciones de Entrenadores (Etapa 1). Replican los CHECK y las reglas de las funciones
// de la migración 065; la base es la que garantiza.
// ============================================================
import { z } from 'zod'
import { TRAINER_LIMITS } from '@/lib/trainers'

const hour = z.string().regex(/^([01]\d|2[0-3]):00$/, 'Elegí una hora en punto')
const rate = z.number({ invalid_type_error: 'Cargá la tarifa' }).int().min(1, 'La tarifa tiene que ser mayor que 0').max(TRAINER_LIMITS.rateMax)

export const trainerProfileSchema = z.object({
    bio: z.string().trim().max(TRAINER_LIMITS.bio, `Hasta ${TRAINER_LIMITS.bio} caracteres`),
    experience: z.string().trim().max(TRAINER_LIMITS.experience, `Hasta ${TRAINER_LIMITS.experience} caracteres`),
    sportIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un deporte'),
})

export function trainerSlotSchema(needsGroupRate: boolean) {
    return z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: hour,
        endTime: hour,
        location: z.string().trim().min(1, 'Indicá dónde se da la clase').max(TRAINER_LIMITS.location, `Hasta ${TRAINER_LIMITS.location} caracteres`),
        rateIndividual: rate,
        rateGroup: needsGroupRate ? rate : rate.nullable(),
        sportIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un deporte'),
    }).refine((v) => v.startTime !== v.endTime, { path: ['endTime'], message: 'El fin tiene que ser distinto del inicio' })
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí las fechas')

export function trainerBlockSchema(today: string, maxDate: string) {
    return z.object({
        startDate: ymd.refine((d) => d >= today, 'No se pueden bloquear días que ya pasaron'),
        endDate: ymd.refine((d) => d <= maxDate, 'Podés bloquear hasta 2 años hacia adelante'),
        reason: z.string().trim().max(TRAINER_LIMITS.blockReason, `Hasta ${TRAINER_LIMITS.blockReason} caracteres`),
    }).refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'La fecha de fin no puede ser anterior a la de inicio' })
}

export const suspendReasonSchema = z.string().trim()
    .min(TRAINER_LIMITS.suspendReasonMin, `Escribí el motivo (al menos ${TRAINER_LIMITS.suspendReasonMin} caracteres)`)
    .max(TRAINER_LIMITS.suspendReasonMax, `Hasta ${TRAINER_LIMITS.suspendReasonMax} caracteres`)

export const slotCommissionSchema = z.number({ invalid_type_error: 'Cargá el porcentaje' }).min(1, 'Entre 1 y 100').max(100, 'Entre 1 y 100')
