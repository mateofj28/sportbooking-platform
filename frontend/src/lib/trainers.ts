// ============================================================
// lib/trainers.ts
// Textos y helpers de Entrenadores (Etapa 1). Las reglas de verdad están en la base
// (migración 065); esto es solo presentación.
// ============================================================

import type { TrainerSlot, TrainerSport, TrainerStatus } from '@/hooks/use-trainer'

/** 0 = lunes … 6 = domingo (igual que la base). */
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

/** Las franjas van en horas en punto: 00:00 … 23:00. */
export const WHOLE_HOURS: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

export const TRAINER_STATUS_META: Record<TrainerStatus, { label: string; color: 'success' | 'warning' | 'danger' }> = {
    DRAFT: { label: 'Borrador', color: 'warning' },
    PUBLISHED: { label: 'Publicado', color: 'success' },
    SUSPENDED: { label: 'Suspendido', color: 'danger' },
}

/** Límites de la base (CHECK de 065). */
export const TRAINER_LIMITS = {
    bio: 300,
    experience: 1000,
    location: 200,
    blockReason: 200,
    suspendReasonMin: 3,
    suspendReasonMax: 300,
    rateMax: 10_000_000,
} as const

/** "20:00 a 21:00" y avisa si cruza la medianoche. */
export function slotRangeLabel(slot: Pick<TrainerSlot, 'startTime' | 'endTime'>): string {
    const crosses = slot.endTime <= slot.startTime
    return `${slot.startTime} a ${slot.endTime}${crosses ? ' (día siguiente)' : ''}`
}

/** Horas que dura la franja (cruce de medianoche incluido). */
export function slotHours(slot: Pick<TrainerSlot, 'startTime' | 'endTime'>): number {
    const s = Number(slot.startTime.slice(0, 2))
    const e = Number(slot.endTime.slice(0, 2))
    return e > s ? e - s : e + 24 - s
}

/** ¿Algún deporte da clases grupales? (cupo de alumnos mayor a 1) */
export function hasGroupSports(sports: Pick<TrainerSport, 'maxStudents'>[]): boolean {
    return sports.some((s) => (s.maxStudents ?? 1) > 1)
}

/** "1 h" / "1 o 2 h" a partir de las duraciones del deporte. */
export function durationsLabel(durations?: number[]): string {
    if (!durations?.length) return '—'
    const d = [...durations].sort((a, b) => a - b)
    return d.length === 1 ? `${d[0]} h` : `${d.slice(0, -1).join(', ')} o ${d[d.length - 1]} h`
}

/** Precio final por hora: tarifa + comisión (mismo redondeo que la base). */
export function finalRate(rate: number, percent: number): number {
    return rate + Math.round((rate * percent) / 100)
}

/** Orden semanal: lunes primero, luego por hora de inicio. */
export function sortSlots<T extends Pick<TrainerSlot, 'dayOfWeek' | 'startTime'>>(slots: T[]): T[] {
    return [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
}

// ---------------------------------------------------------------
// Clases (Etapa 2)
// ---------------------------------------------------------------

/** Quién canceló, en palabras. */
export const CANCELLED_BY_LABEL: Record<string, string> = {
    CLIENT: 'el alumno',
    TRAINER: 'el entrenador',
    ADMIN: 'la administración',
    SYSTEM: 'el sistema',
}

/**
 * Estado de negocio de una reserva de clase (negocio.md): Realizada (pagada, la clase no terminó),
 * Completada (la clase terminó) o Cancelada.
 */
export function classBookingChip(
    b: { status: string; paymentStatus?: string; class: { start: string; end: string } }, nowMs: number,
): { label: string; color: 'primary' | 'success' | 'danger' | 'warning' | 'default' } {
    if (b.status === 'CANCELLED') return { label: 'Cancelada', color: 'danger' }
    // Fecha de clase fija sin pagar: todavía no es una reserva realizada (el cron la cancela si no se paga)
    if (b.paymentStatus === 'PENDING') {
        return new Date(b.class.start).getTime() <= nowMs ? { label: 'No se pagó', color: 'default' } : { label: 'Pendiente de pago', color: 'warning' }
    }
    if (b.status === 'COMPLETED' || new Date(b.class.end).getTime() <= nowMs) return { label: 'Completada', color: 'success' }
    return { label: 'Realizada', color: 'primary' }
}

/** Estado de una clase para el entrenador y el admin. */
export function classChip(
    c: { status: string; end: string; start: string }, nowMs: number,
): { label: string; color: 'primary' | 'success' | 'danger' | 'warning' } {
    if (c.status === 'CANCELLED') return { label: 'Cancelada', color: 'danger' }
    if (c.status === 'COMPLETED' || new Date(c.end).getTime() <= nowMs) return { label: 'Completada', color: 'success' }
    if (new Date(c.start).getTime() <= nowMs) return { label: 'En curso', color: 'warning' }
    return { label: 'Próxima', color: 'primary' }
}

/** Días AR: "lun, mié y vie" a partir de 0..6. */
export function daysLabel(days: number[]): string {
    const short = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
    const d = [...new Set(days)].sort((a, b) => a - b).map((i) => short[i])
    return d.length <= 1 ? (d[0] ?? '—') : `${d.slice(0, -1).join(', ')} y ${d[d.length - 1]}`
}
