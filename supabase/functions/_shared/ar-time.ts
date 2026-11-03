// ============================================================
// _shared/ar-time.ts
// Helpers de zona horaria Argentina (UTC-3).
// Toda la lógica de fechas usa UTC internamente.
// Solo convertir a AR para labels de UI y para calcular el "día AR".
// ============================================================

const AR_OFFSET_MS = 3 * 60 * 60 * 1000  // UTC-3

/** Instante UTC convertido a hora Argentina */
export function toArDate(d: Date | string): Date {
  return new Date(new Date(d).getTime() - AR_OFFSET_MS)
}

/** Día en hora AR: "2026-10-27" */
export function arDayKey(d: Date | string): string {
  return toArDate(d).toISOString().split('T')[0]
}

/** Medianoche hora Argentina como instante UTC */
export function arMidnightUtc(dateStr: string): Date {
  // "2026-10-27" → 2026-10-27T03:00:00Z (medianoche AR = 03:00 UTC)
  return new Date(`${dateStr}T03:00:00.000Z`)
}

/** Hora 12h en AR: "9:00 p. m." */
export function arTime(d: Date | string): string {
  const ar = toArDate(d)
  let h = ar.getUTCHours()
  const m = ar.getUTCMinutes()
  const ampm = h < 12 ? 'a. m.' : 'p. m.'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Fecha larga en AR: "lunes, 27 de octubre de 2026" */
export function arDateLabel(d: Date | string): string {
  return toArDate(d).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
