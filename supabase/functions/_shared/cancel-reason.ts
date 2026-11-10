// ============================================================
// _shared/cancel-reason.ts
// Normaliza el motivo de cancelación que manda el cliente.
// Mismo límite que Zod (CANCEL_REASON_MAX) y que la base
// (CHECK bookings_cancellation_reason_len, migración 026).
// ============================================================

export const CANCEL_REASON_MAX = 300

export type CancelReasonResult =
  | { ok: true; reason: string | null }
  | { ok: false; error: string }

/** Vacío o ausente -> null. Debe ser texto de hasta 300 caracteres (sin espacios de los bordes). */
export function normalizeCancelReason(raw: unknown): CancelReasonResult {
  if (raw === undefined || raw === null) return { ok: true, reason: null }
  if (typeof raw !== 'string') return { ok: false, error: 'El motivo debe ser texto' }
  const reason = raw.trim()
  if (reason.length === 0) return { ok: true, reason: null }
  if (reason.length > CANCEL_REASON_MAX) {
    return { ok: false, error: `El motivo admite hasta ${CANCEL_REASON_MAX} caracteres` }
  }
  return { ok: true, reason }
}
